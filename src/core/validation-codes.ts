// Every SmartSpectra ValidationCode (SDK 3.5.0) mapped to plain language.
// short = chip label; tip = what the person should do.
export interface ValidationMessage { short: string; tip: string; blocking: boolean }

const MAP: Record<number, ValidationMessage> = {
  0: { short: 'Good', tip: 'Signal looks good.', blocking: false },
  1: { short: 'No face', tip: 'Face the camera so your whole face is in view.', blocking: true },
  2: { short: 'Two faces', tip: 'Only one person should be in view.', blocking: true },
  3: { short: 'Off-centre', tip: 'Move so your face is in the middle of the picture.', blocking: true },
  4: { short: 'Face size', tip: 'Adjust your distance: about an arm’s length from the camera.', blocking: true },
  5: { short: 'Too dark', tip: 'Add more even light in front of you.', blocking: true },
  6: { short: 'Too bright', tip: 'Reduce bright light; avoid a window or lamp shining into the camera.', blocking: true },
  7: { short: 'Chest hidden', tip: 'Sit back so your chest (and ideally waist) is in view.', blocking: true },
  10: { short: 'Camera tuning', tip: 'Hold still for a moment while the camera adjusts.', blocking: true },
  11: { short: 'Low frame rate', tip: 'The camera is too slow. Close other apps using the camera or add light.', blocking: true },
  12: { short: 'Moving', tip: 'Hold still. Rest your arms and lean back.', blocking: true },
  13: { short: 'Too close', tip: 'Move back a little.', blocking: true },
  14: { short: 'Too far', tip: 'Move a little closer.', blocking: true },
  15: { short: 'Too high', tip: 'Lower the camera or sit up so your face is centred.', blocking: true },
  16: { short: 'Too low', tip: 'Raise the camera or sit lower so your face is centred.', blocking: true },
  17: { short: 'Face turned', tip: 'Face the camera straight on.', blocking: true },
};

export function validationMessage(code: number): ValidationMessage {
  return MAP[code] ?? { short: `Code ${code}`, tip: 'The camera reading is not ready. Hold still and face the camera.', blocking: true };
}
export const ALL_VALIDATION_CODES = Object.keys(MAP).map(Number);
