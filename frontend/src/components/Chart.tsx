import React from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  TitleComponent,
  TooltipComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  LineChart,
  DataZoomComponent,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer
]);

type ChartProps = Omit<React.ComponentProps<typeof ReactEChartsCore>, 'echarts'>;

const Chart: React.FC<ChartProps> = React.memo((props) => (
  <ReactEChartsCore echarts={echarts} {...props} />
));

export default Chart;
