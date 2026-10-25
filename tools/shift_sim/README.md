# Shift simulator

The judge for "Set Ups never loses a change" (TIM-103). Several headless
phones fill a day's Set Ups and run breaks at once against a local copy of
the app, while a scenario adds chaos. A run passes only if the server ends
up with every intended change and every phone agrees with it. Data is
made up; nothing touches the live site.

    cd tools/shift_sim
    node sim.js all 5          # every kind of chaos at once, 5 phones
    node sim.js overlap 5 7    # one scenario, 5 phones, random seed 7
    node speed.js 5            # Set Ups speed on a throttled phone

Needs Playwright (`require('playwright')`) and the app's Python packages.
`sim.js` lists the scenarios. `sim_server.py` is the real app with a
file-backed stand-in for Firebase (so a restart keeps the data) and chaos
switches (`POST /__chaos`).

Run `node sim.js all` before merging any change to saving, syncing or Set Ups.
