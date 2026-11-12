/* EpiScope — meshnet_wasm.c : noyaux de calcul WebAssembly SIMD (128 bits) de src/imaging/meshnet.js.
 *
 * Source du module embarqué (base64) dans meshnet.js (constante WASM_B64). Recompiler après modification :
 *   clang --target=wasm32 -O3 -msimd128 -nostdlib -fno-builtin -Wl,--no-entry -Wl,--import-memory \
 *         -Wl,--export=__heap_base -Wl,--stack-first -Wl,-z,stack-size=65536 -Wl,--strip-all -o /tmp/meshnet.wasm tools/meshnet_wasm.c
 *   base64 -w0 /tmp/meshnet.wasm     → remplacer WASM_B64 dans src/imaging/meshnet.js
 * (clang/wasm-ld 18 ; aucune bibliothèque C : exp/erf sont codés ici).
 *
 * Conventions (identiques au repli JavaScript de meshnet.js) :
 *   - activations « canal dernier » : buf[(x + bx*(y + by*plan))*C + c] (entrées et sorties des tâches) ;
 *   - noyau 3×3×3 réordonné [dz][dy][dx][ci][co] (dz ↔ axe k des plans, dx ↔ axe x le plus rapide), biais [co] ;
 *   - pz[z*3 + t] = plan local de l'entrée pour la sortie z et la prise t (z + (t−1)·dil) ou −1 (hors boîte → zéro) ;
 *   - activations : 0 linéaire, 1 relu, 2 elu, 3 gelu (erf d'Abramowitz-Stegun 7.1.26, comme tf.js) ;
 *   - tête 1×1×1 fusionnée : W2 [ci][nv2*4] (nv2 multiple de 4), argmax au premier maximum (comme tf.argMax).
 * Calcul « vectorisé en x » : chaque vecteur SIMD porte 4 voxels consécutifs d'un même canal ; l'entrée est d'abord
 * réécrite en lignes planaires [plan][y][c][M + x + M] bordées de M = dil zéros (aucun test de bord en x), les poids
 * sont répliqués ×4 ; les canaux de sortie sont traités par blocs de K ≤ 8 accumulateurs (aucune voie perdue même pour
 * 5 canaux). Ordre des sommes : prises (dz, dy, dx) puis canaux d'entrée, en float32 comme tf.js-CPU.  */
#include <wasm_simd128.h>
#include <stdint.h>

#define EXPORT(n) __attribute__((export_name(n)))

/* exp en simple précision (Cephes expf), x ≤ 0 suffit ici (elu, erf) mais la fonction reste générale */
static inline float expf_(float x) {
  if (x < -87.0f) return 0.0f;
  if (x > 88.0f) x = 88.0f;
  float fx = __builtin_floorf(x * 1.44269504088896341f + 0.5f);
  x = x - fx * 0.693359375f;
  x = x - fx * -2.12194440e-4f;
  float z = x * x;
  float y = (((((1.9875691500E-4f * x + 1.3981999507E-3f) * x + 8.3334519073E-3f) * x + 4.1665795894E-2f) * x + 1.6666665459E-1f) * x + 5.0000001201E-1f) * z + x + 1.0f;
  union { float f; int32_t i; } u; u.i = ((int32_t)fx + 127) << 23;
  return y * u.f;
}
static inline float erf_(float x) {
  float s = x < 0 ? -1.0f : (x > 0 ? 1.0f : 0.0f), v = x < 0 ? -x : x;
  float t = 1.0f / (1.0f + 0.3275911f * v);
  return s * (1.0f - (((((1.061405429f * t + -1.453152027f) * t) + 1.421413741f) * t + -0.284496736f) * t + 0.254829592f) * t * expf_(-v * v));
}
static inline float act_(float x, int act) {
  switch (act) {
    case 1: return x > 0 ? x : 0.0f;
    case 2: return x >= 0 ? x : expf_(x) - 1.0f;
    case 3: return x * (0.5f * (1.0f + erf_(x / 1.4142135623730951f)));
    default: return x;
  }
}

/* tête 1×1×1 + argmax pour un voxel (h : inC valeurs déjà activées) ; blocs de 4 vecteurs (16 classes) */
static inline int head_(const float *h, int inC, const float *W2, const float *B2, int outC2, int nv2, float *tmp) {
  float best = -__builtin_inff(); int bi = 0;
  for (int v0 = 0; v0 < nv2; v0 += 4) {
    v128_t a0 = wasm_v128_load(B2 + 4 * v0), a1 = wasm_v128_load(B2 + 4 * v0 + 4), a2 = wasm_v128_load(B2 + 4 * v0 + 8), a3 = wasm_v128_load(B2 + 4 * v0 + 12);
    const float *w = W2 + 4 * v0;
    for (int c = 0; c < inC; c++, w += 4 * nv2) {
      v128_t va = wasm_f32x4_splat(h[c]);
      a0 = wasm_f32x4_add(a0, wasm_f32x4_mul(va, wasm_v128_load(w)));
      a1 = wasm_f32x4_add(a1, wasm_f32x4_mul(va, wasm_v128_load(w + 4)));
      a2 = wasm_f32x4_add(a2, wasm_f32x4_mul(va, wasm_v128_load(w + 8)));
      a3 = wasm_f32x4_add(a3, wasm_f32x4_mul(va, wasm_v128_load(w + 12)));
    }
    wasm_v128_store(tmp, a0); wasm_v128_store(tmp + 4, a1); wasm_v128_store(tmp + 8, a2); wasm_v128_store(tmp + 12, a3);
    int n = outC2 - 4 * v0; if (n > 16) n = 16;
    for (int j = 0; j < n; j++) if (tmp[j] > best) { best = tmp[j]; bi = 4 * v0 + j; }
  }
  return bi;
}

/* sortie d'un voxel : activation, puis écriture (outC flottants) ou tête 1×1×1 + argmax (étiquette) */
static inline void emit_(const float *acc, long o, float *out, int outC, int act, const float *W2, const float *B2, int outC2, int nv2,
                         uint8_t *lab, float *tmp) {
  if (lab) { float *h = tmp + 32; for (int c = 0; c < outC; c++) h[c] = act_(acc[c], act); lab[o] = (uint8_t)head_(h, outC, W2, B2, outC2, nv2, tmp); }
  else { float *d = out + o * outC; if (act == 1) { for (int c = 0; c < outC; c++) d[c] = acc[c] > 0 ? acc[c] : 0.0f; } else for (int c = 0; c < outC; c++) d[c] = act_(acc[c], act); }
}

/* bloc de K canaux de sortie (co0..co0+K−1) pour 4 voxels x0..x0+3 : R[r] = ligne planaire (décalée de M) de la
 * r-ième prise (dz,dy) valide, tz[r] = indice de prise (dz*3+dy)*3 ; rs = longueur d'une ligne d'un canal */
#define BLOCK(K)                                                                                                        \
  static void block_k##K(const float *const *R, const int *tz, int nr, int x0, int dil, int inC, int rs,                \
                         const float *W4, const float *B, int outC, int co0, float *t) {                                \
    v128_t acc[K]; for (int k = 0; k < K; k++) acc[k] = wasm_f32x4_splat(B[co0 + k]);                                  \
    for (int r = 0; r < nr; r++) for (int dx = 0; dx < 3; dx++) {                                                       \
      const float *s = R[r] + x0 + (dx - 1) * dil, *w = W4 + ((long)(tz[r] + dx) * inC * outC + co0) * 4;             \
      for (int c = 0; c < inC; c++, s += rs, w += outC * 4) {                                                           \
        v128_t v = wasm_v128_load(s);                                                                                   \
        for (int k = 0; k < K; k++) acc[k] = wasm_f32x4_add(acc[k], wasm_f32x4_mul(v, wasm_v128_load(w + 4 * k)));     \
      }                                                                                                                 \
    }                                                                                                                   \
    for (int k = 0; k < K; k++) wasm_v128_store(t + 4 * (co0 + k), acc[k]);                                            \
  }
BLOCK(1) BLOCK(2) BLOCK(3) BLOCK(4) BLOCK(5) BLOCK(6) BLOCK(7) BLOCK(8)
typedef void (*block_fn)(const float *const *, const int *, int, int, int, int, int, const float *, const float *, int, int, float *);
static const block_fn BLOCKS[9] = { 0, block_k1, block_k2, block_k3, block_k4, block_k5, block_k6, block_k7, block_k8 };

/* convolution 3×3×3 dilatée (« same », zéros hors boîte) sur nz plans de sortie (outC ≤ 64).
 * Zones de travail : T (np·by·inC·(bxr + 2·dil) flottants), W4 (27·inC·outC·4), tmp (416 flottants, aligné sur 16 octets). */
EXPORT("conv") int conv(const float *in, int np, const int *pz, int nz, int bx, int by, int inC, int dil, const float *W, const float *B,
                        float *out, int outC, int act, const float *W2, const float *B2, int outC2, int nv2, uint8_t *lab,
                        float *T, float *W4, float *tmp) {
  if (outC > 64) return -1;
  const int M = dil, bxr = (bx + 3) & ~3, rs = bxr + 2 * M, plane = by * inC * rs;
  for (long i = 0, n = 27L * inC * outC; i < n; i++) wasm_v128_store(W4 + 4 * i, wasm_f32x4_splat(W[i]));
  for (int p = 0; p < np; p++) for (int y = 0; y < by; y++) {          /* lignes planaires bordées de zéros */
    const float *s = in + ((long)p * by + y) * bx * inC; float *d = T + (long)p * plane + (long)y * inC * rs;
    for (long i = 0; i < (long)inC * rs; i++) d[i] = 0.0f;
    for (int x = 0; x < bx; x++) for (int c = 0; c < inC; c++) d[c * rs + M + x] = s[x * inC + c];
  }
  int nch = (outC + 7) / 8, K[8], C0[8];                                /* blocs de canaux presque égaux, ≤ 8 */
  for (int ch = 0, co = 0; ch < nch; ch++) { K[ch] = (outC - co + (nch - ch) - 1) / (nch - ch); C0[ch] = co; co += K[ch]; }
  float *v = tmp + 96, *t = tmp + 160;                                  /* v : un voxel (64) ; t : [co][4 voxels] (256) */
  for (int z = 0; z < nz; z++) for (int y = 0; y < by; y++) {
    const float *R[9]; int nr = 0, tz[9];
    for (int dz = 0; dz < 3; dz++) { int p = pz[z * 3 + dz]; if (p < 0) continue;
      for (int dy = 0; dy < 3; dy++) { int yy = y + (dy - 1) * dil; if (yy < 0 || yy >= by) continue;
        R[nr] = T + (long)p * plane + (long)yy * inC * rs + M; tz[nr++] = (dz * 3 + dy) * 3; } }
    for (int x0 = 0; x0 < bxr; x0 += 4) {
      for (int ch = 0; ch < nch; ch++) BLOCKS[K[ch]](R, tz, nr, x0, dil, inC, rs, W4, B, outC, C0[ch], t);
      for (int l = 0; l < 4 && x0 + l < bx; l++) {
        for (int c = 0; c < outC; c++) v[c] = t[4 * c + l];
        emit_(v, ((long)z * by + y) * bx + x0 + l, out, outC, act, W2, B2, outC2, nv2, lab, tmp);
      }
    }
  }
  return 0;
}

/* tête seule (après une couche normalisée) : n voxels de inC canaux → étiquettes */
EXPORT("head") void head(const float *in, int n, int inC, const float *W2, const float *B2, int outC2, int nv2, uint8_t *lab, float *tmp) {
  for (int i = 0; i < n; i++) lab[i] = (uint8_t)head_(in + (long)i * inC, inC, W2, B2, outC2, nv2, tmp);
}

/* transformation en place x ← act((x − m[c])·s[c]) (normalisation d'instance différée + activation) */
EXPORT("transform") void transform(float *buf, int n, int C, const float *m, const float *s, int act) {
  for (int i = 0; i < n; i++, buf += C)
    for (int c = 0; c < C; c++) buf[c] = act_((buf[c] - m[c]) * s[c], act);
}

/* sommes par canal (double précision) pour la normalisation d'instance */
EXPORT("stats") void stats(const float *buf, int n, int C, double *sum, double *sq) {
  for (int c = 0; c < C; c++) { sum[c] = 0; sq[c] = 0; }
  for (int i = 0; i < n; i++, buf += C)
    for (int c = 0; c < C; c++) { double v = buf[c]; sum[c] += v; sq[c] += v * v; }
}
