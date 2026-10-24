import {
  METERS_PER_MILE,
  displayToMeters,
  formatDistance,
  formatDuration,
  formatDurationShort,
  formatElevation,
  formatMetricValue,
  formatPace,
  formatSpeed,
  metersToDisplay,
  paceSecondsPerUnit,
  parseDurationInput,
} from '../units';

describe('unit conversion', () => {
  it('converts meters to km and miles at the presentation boundary only', () => {
    expect(metersToDisplay(5000, 'metric')).toBe(5);
    expect(metersToDisplay(METERS_PER_MILE, 'imperial')).toBe(1);
    expect(metersToDisplay(10000, 'imperial')).toBeCloseTo(6.2137, 4);
  });

  it('round-trips user input back to canonical meters', () => {
    expect(displayToMeters(5, 'metric')).toBe(5000);
    expect(displayToMeters(3.1, 'imperial')).toBe(4989);
    expect(displayToMeters(metersToDisplay(21097, 'imperial'), 'imperial')).toBe(21097);
  });

  it('formats distances with sensible precision', () => {
    expect(formatDistance(5234, 'metric')).toBe('5.23 km');
    expect(formatDistance(42195, 'metric')).toBe('42.2 km');
    expect(formatDistance(1_000_000, 'metric')).toBe('1,000 km');
    expect(formatDistance(1609.344, 'imperial')).toBe('1.00 mi');
    expect(formatDistance(-5, 'metric')).toBe('0.00 km');
    expect(formatDistance(5000, 'metric', { withUnit: false, fractionDigits: 1 })).toBe('5.0');
  });

  it('formats elevation in m or ft', () => {
    expect(formatElevation(100, 'metric')).toBe('100 m');
    expect(formatElevation(100, 'imperial')).toBe('328 ft');
  });
});

describe('duration and pace', () => {
  it('formats durations', () => {
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(309)).toBe('5:09');
    expect(formatDuration(3909)).toBe('1:05:09');
    expect(formatDurationShort(12300)).toBe('3h 25m');
    expect(formatDurationShort(7200)).toBe('2h');
    expect(formatDurationShort(45)).toBe('45s');
  });

  it('computes pace per km and per mile', () => {
    // 5 km in 25 minutes = 3.333 m/s = 5:00 /km = 8:03 /mi
    const speed = 5000 / 1500;
    expect(paceSecondsPerUnit(speed, 'metric')).toBeCloseTo(300, 5);
    expect(formatPace(speed, 'metric')).toBe('5:00 /km');
    expect(formatPace(speed, 'imperial')).toBe('8:03 /mi');
  });

  it('returns a placeholder pace when stationary', () => {
    expect(formatPace(0, 'metric')).toBe('-- /km');
    expect(formatPace(0.05, 'metric', false)).toBe('--');
    expect(paceSecondsPerUnit(Number.NaN, 'metric')).toBeNull();
  });

  it('formats speed for rides', () => {
    expect(formatSpeed(10, 'metric')).toBe('36.0 km/h');
    expect(formatSpeed(10, 'imperial')).toBe('22.4 mph');
  });

  it('formats challenge metric values', () => {
    expect(formatMetricValue('distance', 25000, 'metric')).toBe('25.0 km');
    expect(formatMetricValue('duration', 36000, 'metric')).toBe('10h');
    expect(formatMetricValue('count', 1, 'metric')).toBe('1 activity');
    expect(formatMetricValue('count', 20, 'metric')).toBe('20 activities');
  });

  it('parses duration input', () => {
    expect(parseDurationInput('45')).toBe(2700);
    expect(parseDurationInput('32:10')).toBe(1930);
    expect(parseDurationInput('1:05:00')).toBe(3900);
    expect(parseDurationInput('1:75')).toBeNull();
    expect(parseDurationInput('abc')).toBeNull();
    expect(parseDurationInput('')).toBeNull();
  });
});
