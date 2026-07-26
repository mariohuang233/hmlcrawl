export type ColorTheme = 'light' | 'dark';

export const getChartTheme = (theme: ColorTheme) => {
  const dark = theme === 'dark';

  return {
    text: dark ? '#f1f1ef' : '#181817',
    textStrong: dark ? '#f7f7f5' : '#111110',
    muted: dark ? '#a3a3a0' : '#777773',
    grid: dark ? 'rgba(245, 245, 240, 0.08)' : 'rgba(24, 24, 23, 0.08)',
    axis: dark ? 'rgba(245, 245, 240, 0.16)' : 'rgba(24, 24, 23, 0.14)',
    tooltipBackground: dark ? 'rgba(31, 31, 29, 0.98)' : 'rgba(250, 250, 248, 0.98)',
    tooltipBorder: dark ? 'rgba(245, 245, 240, 0.14)' : 'rgba(24, 24, 23, 0.12)',
    tooltipShadow: dark
      ? 'box-shadow: 0 14px 36px rgba(0, 0, 0, 0.38); max-width: 220px;'
      : 'box-shadow: 0 14px 36px rgba(24, 24, 23, 0.12); max-width: 220px;',
    pointBorder: dark ? '#181817' : '#fafaf8',
    zoomBackground: dark ? '#292927' : '#ececea',
    zoomFill: dark ? 'rgba(245, 245, 240, 0.18)' : 'rgba(24, 24, 23, 0.14)',
    series: '#ff385c',
    seriesMuted: dark ? '#555552' : '#dededb',
    areaTop: 'rgba(255, 56, 92, 0.17)',
    areaBottom: 'rgba(255, 56, 92, 0.01)',
    accent: '#ff385c',
    positive: dark ? '#b7b7b2' : '#6f6f6b'
  };
};
