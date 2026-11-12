---
id: faq
title: Frequently asked questions and troubleshooting
short: FAQ
group: ref
order: 30
lead: The questions colleagues ask most often, and what to do when something does not work.
---

# Frequently asked questions and troubleshooting

## Getting started {#prise-en-main}

**Do I need to install anything?**
No. `EpiScope.html` opens in Edge or Chrome, including from a USB stick, a network share or a virtual machine without a graphics card.

**Does my data go on the Internet?**
No. EpiScope connects to nothing. The only exception, with your explicit consent, is the one-time download of the video conversion tool (ffmpeg) to play an old format; the video itself never leaves the computer.

**Do I have to fill in everything?**
No. Each screen is useful on its own. A meeting can be prepared with two seizures and an MRI report.

**How do I switch the application to English?**
[[⋯]] › *Language* › *English*. The choice is remembered on this computer; data you entered are not translated.

## Common problems {#problemes-courants}

**The 3D view is slow or black.**
The computer may have no graphics acceleration (virtual machine): EpiScope switches to software rendering, which is slower. Reduce the number of views ([[1 view ▾]]), close other browser tabs, or use compact density.

**The save dot is red.**
The record may be open by a colleague (lock), or the folder is no longer reachable (disconnected share). Hover over the dot for details. Nothing is lost: changes are kept and written as soon as possible.

**"Record open by a colleague".**
A lock is set when a record is open. If it remains after an abrupt shutdown, it expires on its own after a few minutes.

**An image is wrongly registered.**
Use [[landmarks…]] or [[adjust]] on the Imaging screen (see [If registration fails](@imagerie#si-le-recalage-echoue)).

**The segmentation spills over or misses a region.**
Try [[Other method…]] (compare the methods and choose), or import a FreeSurfer segmentation. In young children, prefer the SPM-like atlas.

**An EDF recording does not open.**
Check that it is a standard EDF or BDF (exported from the acquisition software). A truncated file is read up to the last complete sample, with a warning. Native Micromed `.TRC` files must be exported to EDF from Brainquick.

**Detected spikes are mostly artefacts.**
Review the clusters and delete the artefact ones; raise the SpikeNet threshold; or enable the patient-specific filter ("Learn from my review").

**The MDT slideshow is too long.**
In *Prepare*, untick the explorations or seizures not to show, and tick only the useful captures.

**I deleted something by mistake.**
The record's log tells what and when. For spike and sleep edits, <kbd>Ctrl</kbd>+<kbd>Z</kbd>. Otherwise, go back to the folder's backup.

## Reporting a problem {#signaler-un-probleme}

Note what you were doing and on which screen, and take a capture ([[Capture ▾]] or <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>). The credits ([[⋯]] › *Credits and sources*) name the authors of the application.
