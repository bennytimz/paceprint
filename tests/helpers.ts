export { detectBeats, heartRateSeries, coupling, adherence } from '../src/core/analysis';
import { toneAmplitude } from '../src/core/dsp';
export function toneAmplitudeCheck() {
  const x = Array.from({ length: 400 }, (_, i) => 3 * Math.cos(2 * Math.PI * 0.1 * i / 4));
  return Math.abs(toneAmplitude(x, 4, 0.1) - 3) < 0.05;
}
