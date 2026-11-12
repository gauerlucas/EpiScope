# -*- coding: utf-8 -*-
"""Cas d'exemple (fictifs, construits d'après les séquences typiques de la littérature) → tools/tests/fixtures/*.json"""
import json, os
D = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures')
os.makedirs(D, exist_ok=True)

def case(name, dominant, events, eeg=None, notes=''):
    evs = []
    for i, e in enumerate(events):
        sign, t, dur = e[0], e[1], e[2]
        evs.append(dict(id=i + 1, sign_id=sign, t=t, dt=e[3] if len(e) > 3 else 1, dur=dur, side=e[4] if len(e) > 4 else '', topography=e[5] if len(e) > 5 else '', conf=e[6] if len(e) > 6 else 1, note=e[7] if len(e) > 7 else ''))
    return dict(version=1, app='EpiScope', name=name, notes=notes, patient=dict(dominant=dominant, eeg_onset=eeg, lesion=[]), events=evs, params={})

cases = {
 'exemple_temporal_mesial_gauche': case('Exemple — temporal mésial gauche (séquence type Maillard 2004, groupe M)', 'L', [
    ('aura_epigastric', 0, 12, 1), ('fear', 2, 8, 1, '', '', 0.75), ('head_turn_nonforced', 6, 3, 1, 'L'),
    ('loss_of_awareness', 15, 45, 2), ('oroalimentary_automatisms', 18, 35, 2), ('gestural_automatisms_distal', 22, 30, 2, 'L'),
    ('dystonic_posturing', 24, 20, 2, 'R', 'UL'), ('postictal_aphasia', 70, 120, 5), ('postictal_nose_wiping', 75, 5, 3, 'L')],
    eeg=-8, notes='Latence clinique 8 s (début EEG avant le premier signe). Automatismes retardés, dystonie controlatérale.'),
 'exemple_insulaire_gauche': case('Exemple — opercule-insulaire gauche (séquence Isnard 2004)', 'L', [
    ('laryngeal_constriction', 0, 10, 1), ('somatosensory_paresthesia', 3, 15, 1, 'R', 'hemibody', 1, 'désagréables, conscience conservée'),
    ('dysarthria', 8, 12, 2), ('facial_contraction', 13, 15, 2, 'R'), ('clonic', 18, 20, 2, 'R', 'UL'), ('hypersalivation', 10, 20, 3)]),
 'exemple_frontal_hyperkinetique': case('Exemple — frontal mésial / cingulaire, crise hypermotrice du sommeil', 'L', [
    ('arousal_from_sleep', 0, 3, 1), ('fear', 1, 6, 1, '', '', 0.75), ('chapeau_de_gendarme', 2, 5, 1), ('vocalization', 3, 4, 1),
    ('hyperkinetic', 4, 25, 1), ('pedaling', 6, 15, 2), ('asymmetric_tonic', 22, 10, 2, 'R'), ('fbtcs', 30, 60, 3, '', '', 0.5)],
    notes='Bonini 2014 groupe 2 : tonique axial, chapeau de gendarme, hypermoteur non intégré.'),
 'exemple_moteur_puis_auditif': case('Exemple — moteur puis auditif à 3 s (propagation par relais)', 'L', [
    ('clonic', 0, 10, 1, 'L', 'UL'), ('auditory_elementary', 3, 10, 1), ('aphasia_comprehension', 9, 20, 2)],
    notes='Illustre le calcul des relais : précentral D → postcentral → opercule pariétal → insula postérieure → Heschl.'),
}
for k, v in cases.items():
    with open(os.path.join(D, k + '.json'), 'w', encoding='utf-8') as f: json.dump(v, f, ensure_ascii=False, indent=1)
print('examples', len(cases))
