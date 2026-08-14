export type ColorTheme = 'light' | 'dark';

export const getChartTheme = (theme: ColorTheme) => {
  const dark = theme === 'dark';

  return {
    text: dark ? '#d9d9d6' : '#343538',
    textStrong: dark ? '#e7e7e3' : '#29292b',
    muted: dark ? '#929491' : '#77797d',
    grid: dark ? 'rgba(229, 229, 226, 0.065)' : 'rgba(43, 44, 47, 0.06)',
    axis: dark ? 'rgba(229, 229, 226, 0.12)' : 'rgba(43, 44, 47, 0.095)',
    tooltipBackground: dark ? 'rgba(32, 33, 37, 0.97)' : 'rgba(250, 250, 251, 0.97)',
    tooltipBorder: dark ? 'rgba(229, 229, 226, 0.13)' : 'rgba(43, 44, 47, 0.11)',
    tooltipShadow: dark
      ? 'box-shadow: 0 14px 36px rgba(0, 0, 0, 0.38); max-width: 220px;'
      : 'box-shadow: 0 14px 36px rgba(50, 52, 56, 0.10); max-width: 220px;',
    pointBorder: dark ? '#202125' : '#fafafb',
    zoomBackground: dark ? '#2b2d31' : '#e4e6e9',
    zoomFill: dark ? 'rgba(229, 229, 226, 0.17)' : 'rgba(43, 44, 47, 0.13)',
    series: dark ? '#409cff' : '#0a84ff',
    seriesMuted: dark ? 'rgba(64, 156, 255, 0.30)' : 'rgba(10, 132, 255, 0.20)',
    areaTop: dark ? 'rgba(64, 156, 255, 0.20)' : 'rgba(10, 132, 255, 0.16)',
    areaBottom: dark ? 'rgba(64, 156, 255, 0.01)' : 'rgba(10, 132, 255, 0.01)',
    accent: dark ? '#409cff' : '#0a84ff',
    positive: dark ? '#b7b7b2' : '#6f6f6b'
  };
};
