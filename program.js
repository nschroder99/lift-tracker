/* ============================================================================
   PROGRAM DEFINITION — Upper/Lower A/B on a 2-on / 1-off rotation
   ----------------------------------------------------------------------------
   Rotation:  Upper A -> Lower A -> REST -> Upper B -> Lower B -> REST -> repeat
   6-day cycle, 4 training days. Every muscle gets trained twice per cycle,
   which works out to ~2.3x per week — the frequency range that consistently
   beats once-a-week training in the hypertrophy literature.

   Weights are stored in the user's chosen unit. `inc` is the smallest sensible
   jump for that lift, expressed in lb (converted for kg users).
   ========================================================================== */

const REP_SCHEMES = {
  heavy:    { rir: 2, note: 'Leave 2 in the tank. Last rep should be grindy but clean.' },
  moderate: { rir: 1, note: 'Push to 1–2 reps from failure.' },
  pump:     { rir: 0, note: 'Take these to technical failure — form breaks, you stop.' },
};

/* Muscle keys used for weekly volume accounting */
const MUSCLES = {
  chest:  'Chest',
  back:   'Back',
  quads:  'Quads',
  hams:   'Hamstrings',
  glutes: 'Glutes',
  delts:  'Side Delts',
  bis:    'Biceps',
  tris:   'Triceps',
  calves: 'Calves',
  core:   'Core',
};

const PROGRAM = {
  name: 'Upper / Lower A-B',
  cycleLength: 6,
  /* The rotation the app walks through. REST entries are schedule guidance;
     the "next workout" pointer only ever advances across training days. */
  schedule: ['upperA', 'lowerA', 'REST', 'upperB', 'lowerB', 'REST'],
  rotation: ['upperA', 'lowerA', 'upperB', 'lowerB'],

  days: {
    upperA: {
      name: 'Upper A',
      subtitle: 'Horizontal push & row emphasis',
      color: 'red',
      exercises: [
        { id: 'bb_bench',      name: 'Barbell Bench Press',        muscle: 'chest', secondary: ['tris','delts'], sets: 3, lo: 5,  hi: 8,  scheme: 'heavy',    inc: 5,
          cue: 'Shoulder blades pinned down and back. Touch mid-chest, no bounce.',
          subs: ['Dumbbell Bench Press', 'Machine Chest Press'] },
        { id: 'cs_row',        name: 'Chest-Supported Row',        muscle: 'back',  secondary: ['bis'],          sets: 3, lo: 8,  hi: 12, scheme: 'moderate', inc: 5,
          cue: 'Drive elbows back and down. Pause a beat at the top.',
          subs: ['Seal Row', 'Barbell Row'] },
        { id: 'inc_db_press',  name: 'Incline Dumbbell Press',     muscle: 'chest', secondary: ['tris','delts'], sets: 3, lo: 8,  hi: 12, scheme: 'moderate', inc: 5,
          cue: '30° bench. Stretch at the bottom — that stretch is where growth lives.',
          subs: ['Incline Barbell Press', 'Incline Machine Press'] },
        { id: 'lat_pulldown',  name: 'Lat Pulldown',               muscle: 'back',  secondary: ['bis'],          sets: 3, lo: 10, hi: 15, scheme: 'moderate', inc: 10,
          cue: 'Let the lats stretch fully at the top. Pull to collarbone.',
          subs: ['Pull-up (assisted)', 'Kneeling Cable Pullover'] },
        { id: 'lat_raise',     name: 'Dumbbell Lateral Raise',     muscle: 'delts', secondary: [],               sets: 3, lo: 12, hi: 20, scheme: 'pump',     inc: 5,
          cue: 'Lead with the elbow. Light weight, brutal reps — no swinging.',
          subs: ['Cable Lateral Raise', 'Machine Lateral Raise'] },
        { id: 'ez_curl',       name: 'EZ-Bar Curl',                muscle: 'bis',   secondary: [],               sets: 3, lo: 8,  hi: 12, scheme: 'moderate', inc: 5,
          cue: 'Elbows locked at your sides. Control the lowering for 2 seconds.',
          superset: 'A', subs: ['Barbell Curl', 'Cable Curl'] },
        { id: 'tri_pushdown',  name: 'Cable Triceps Pushdown',     muscle: 'tris',  secondary: [],               sets: 3, lo: 10, hi: 15, scheme: 'pump',     inc: 5,
          cue: 'Lock the elbows in place. Full extension, squeeze at the bottom.',
          superset: 'A', subs: ['Rope Pushdown', 'Dip Machine'] },
      ],
    },

    lowerA: {
      name: 'Lower A',
      subtitle: 'Quad emphasis',
      color: 'blue',
      exercises: [
        { id: 'bb_squat',      name: 'Barbell Back Squat',         muscle: 'quads', secondary: ['glutes'],       sets: 3, lo: 5,  hi: 8,  scheme: 'heavy',    inc: 10,
          cue: 'Brace hard before you unrack. Break at hips and knees together.',
          subs: ['Hack Squat', 'Safety Bar Squat'] },
        { id: 'rdl',           name: 'Romanian Deadlift',          muscle: 'hams',  secondary: ['glutes','back'],sets: 3, lo: 8,  hi: 10, scheme: 'moderate', inc: 10,
          cue: 'Push hips back, bar stays against your legs. Stop when hamstrings scream.',
          subs: ['Dumbbell RDL', 'Good Morning'] },
        { id: 'leg_press',     name: 'Leg Press',                  muscle: 'quads', secondary: ['glutes'],       sets: 3, lo: 10, hi: 15, scheme: 'moderate', inc: 20,
          cue: 'Feet low and narrow for quads. Deep as your back allows without rounding.',
          subs: ['Hack Squat', 'Smith Machine Squat'] },
        { id: 'leg_curl',      name: 'Seated Leg Curl',            muscle: 'hams',  secondary: [],               sets: 3, lo: 10, hi: 15, scheme: 'pump',     inc: 10,
          cue: 'Seated beats lying here — it trains the hamstring at long muscle lengths.',
          subs: ['Lying Leg Curl', 'Nordic Curl'] },
        { id: 'calf_standing', name: 'Standing Calf Raise',        muscle: 'calves',secondary: [],               sets: 4, lo: 8,  hi: 12, scheme: 'pump',     inc: 10,
          cue: 'Pause 2 seconds at the bottom stretch. Do not bounce.',
          subs: ['Smith Machine Calf Raise', 'Leg Press Calf Raise'] },
        { id: 'hang_leg_raise',name: 'Hanging Leg Raise',          muscle: 'core',  secondary: [],               sets: 3, lo: 10, hi: 15, scheme: 'moderate', inc: 5,
          cue: 'Curl the pelvis up — do not just swing the legs.',
          subs: ['Cable Crunch', 'Captain’s Chair Raise'] },
      ],
    },

    upperB: {
      name: 'Upper B',
      subtitle: 'Vertical pull & overhead press emphasis',
      color: 'yellow',
      exercises: [
        { id: 'pullup',        name: 'Weighted Pull-up',           muscle: 'back',  secondary: ['bis'],          sets: 3, lo: 6,  hi: 10, scheme: 'heavy',    inc: 5,
          cue: 'Full hang each rep. Add weight once you clear 10 clean bodyweight reps.',
          subs: ['Assisted Pull-up', 'Lat Pulldown (heavy)'] },
        { id: 'ohp',           name: 'Overhead Press',             muscle: 'delts', secondary: ['tris','chest'], sets: 3, lo: 6,  hi: 10, scheme: 'heavy',    inc: 5,
          cue: 'Squeeze glutes, ribs down. Push your head through at lockout.',
          subs: ['Seated Dumbbell Press', 'Machine Shoulder Press'] },
        { id: 'cable_row',     name: 'Seated Cable Row',           muscle: 'back',  secondary: ['bis'],          sets: 3, lo: 10, hi: 12, scheme: 'moderate', inc: 10,
          cue: 'Let the weight pull your shoulder blades forward at the front.',
          subs: ['Chest-Supported Row', 'Machine Row'] },
        { id: 'machine_press', name: 'Machine Chest Press',        muscle: 'chest', secondary: ['tris'],         sets: 3, lo: 10, hi: 15, scheme: 'moderate', inc: 10,
          cue: 'Machine lets you go closer to failure safely. Use that.',
          subs: ['Incline Dumbbell Press', 'Pec Deck'] },
        { id: 'cable_lat_raise',name:'Cable Lateral Raise',        muscle: 'delts', secondary: [],               sets: 3, lo: 12, hi: 20, scheme: 'pump',     inc: 5,
          cue: 'Cable keeps tension at the bottom where dumbbells lose it.',
          subs: ['Dumbbell Lateral Raise', 'Machine Lateral Raise'] },
        { id: 'inc_db_curl',   name: 'Incline Dumbbell Curl',      muscle: 'bis',   secondary: [],               sets: 3, lo: 10, hi: 15, scheme: 'pump',     inc: 5,
          cue: 'Arms hang behind the body — this is the stretched-position curl.',
          superset: 'B', subs: ['Cable Curl (behind body)', 'Hammer Curl'] },
        { id: 'oh_tri_ext',    name: 'Overhead Cable Extension',   muscle: 'tris',  secondary: [],               sets: 3, lo: 10, hi: 15, scheme: 'pump',     inc: 5,
          cue: 'Overhead stretches the long head — the biggest part of your triceps.',
          superset: 'B', subs: ['Skullcrusher', 'Overhead Dumbbell Extension'] },
      ],
    },

    lowerB: {
      name: 'Lower B',
      subtitle: 'Hip hinge emphasis',
      color: 'green',
      exercises: [
        { id: 'deadlift',      name: 'Deadlift',                   muscle: 'hams',  secondary: ['back','glutes'],sets: 3, lo: 4,  hi: 6,  scheme: 'heavy',    inc: 10,
          cue: 'Trap bar is fine. Take slack out of the bar before you pull.',
          subs: ['Trap Bar Deadlift', 'Rack Pull'] },
        { id: 'bulgarian',     name: 'Bulgarian Split Squat',      muscle: 'quads', secondary: ['glutes'],       sets: 3, lo: 8,  hi: 12, scheme: 'moderate', inc: 5,
          cue: 'Per leg. Long stride hits glutes, short stride hits quads.',
          subs: ['Walking Lunge', 'Step-up'] },
        { id: 'leg_ext',       name: 'Leg Extension',              muscle: 'quads', secondary: [],               sets: 3, lo: 12, hi: 15, scheme: 'pump',     inc: 10,
          cue: 'Pause 1 second at the top. This is your safe-to-fail quad set.',
          subs: ['Hack Squat', 'Sissy Squat'] },
        { id: 'lying_curl',    name: 'Lying Leg Curl',             muscle: 'hams',  secondary: [],               sets: 3, lo: 10, hi: 15, scheme: 'pump',     inc: 10,
          cue: 'Hips flat on the pad. Control the negative.',
          subs: ['Seated Leg Curl', 'Nordic Curl'] },
        { id: 'calf_seated',   name: 'Seated Calf Raise',          muscle: 'calves',secondary: [],               sets: 4, lo: 10, hi: 15, scheme: 'pump',     inc: 10,
          cue: 'Seated hits the soleus — the part standing raises miss.',
          subs: ['Leg Press Calf Raise', 'Standing Calf Raise'] },
        { id: 'pallof',        name: 'Ab Wheel Rollout',           muscle: 'core',  secondary: [],               sets: 3, lo: 8,  hi: 12, scheme: 'moderate', inc: 5,
          cue: 'Ribs down, do not let your lower back arch.',
          subs: ['Pallof Press', 'Plank (weighted)'] },
      ],
    },
  },
};

/* Flat lookup: exercise id -> {exercise, dayKey} */
const EXERCISE_INDEX = (() => {
  const idx = {};
  for (const [dayKey, day] of Object.entries(PROGRAM.days)) {
    for (const ex of day.exercises) idx[ex.id] = { ...ex, dayKey, dayName: day.name };
  }
  return idx;
})();
