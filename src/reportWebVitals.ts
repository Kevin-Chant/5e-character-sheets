import { getCLS, getFID, getFCP, getLCP, getTTFB, ReportHandler} from 'web-vitals';
const reportWebVitals = (onPerfEntry: ReportHandler | undefined) => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    getCLS(onPerfEntry);
    getFID(onPerfEntry);
    getFCP(onPerfEntry);
    getLCP(onPerfEntry);
    getTTFB(onPerfEntry);
  };
}

export default reportWebVitals;
