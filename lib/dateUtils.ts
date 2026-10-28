export const parseSheetDate = (dateStr: any): Date | null => {
  if (!dateStr) return null;
  if (typeof dateStr === 'number') return new Date(Math.round((dateStr - 25569) * 86400 * 1000));
  const str = String(dateStr).trim();
  const parts = str.split(/[\/\-]/);
  if (parts.length === 3) {
    let year, month, day;
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2].split(' ')[0], 10);
    } else {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2].split(' ')[0], 10);
    }
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(str);
};

export const toYMD = (val: any): string => {
  const d = parseSheetDate(val);
  if (!d || isNaN(d.getTime())) return String(val || '').trim();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const getMediaDates = (targetDate: Date, _gran?: string) => {
  if (!targetDate || isNaN(targetDate.getTime())) return null;
  const getIsoWeekday = (d: Date) => d.getDay() === 0 ? 7 : d.getDay();
  const e5 = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1); 
  const mondayOfE5 = new Date(e5); mondayOfE5.setDate(e5.getDate() - getIsoWeekday(e5) + 1);
  const curFirstWeek = (mondayOfE5.getMonth() === e5.getMonth()) ? new Date(mondayOfE5) : new Date(e5);

  const prevE5 = new Date(targetDate.getFullYear(), targetDate.getMonth() - 1, 1);
  const mondayOfPrevE5 = new Date(prevE5); mondayOfPrevE5.setDate(prevE5.getDate() - getIsoWeekday(prevE5) + 1);
  const prevFirstWeek = (mondayOfPrevE5.getMonth() === prevE5.getMonth()) ? new Date(mondayOfPrevE5) : new Date(prevE5);

  const nextE5 = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);
  const mondayOfNextE5 = new Date(nextE5); mondayOfNextE5.setDate(nextE5.getDate() - getIsoWeekday(nextE5) + 1);
  const nextFirstWeek = (mondayOfNextE5.getMonth() === nextE5.getMonth()) ? new Date(mondayOfNextE5) : new Date(nextE5);
  
  const curMonthEnd = new Date(nextFirstWeek); curMonthEnd.setDate(curMonthEnd.getDate() - 1);
  const prevMonthEnd = new Date(curFirstWeek); prevMonthEnd.setDate(prevMonthEnd.getDate() - 1);
  const prevMtdEnd = new Date(prevE5.getFullYear(), prevE5.getMonth(), Math.min(targetDate.getDate(), new Date(prevE5.getFullYear(), prevE5.getMonth() + 1, 0).getDate()));
  const chartStartMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() - 2, 1);
  
  return { curStart: curFirstWeek, curMtdEnd: targetDate, curMonthEnd, prevStart: prevFirstWeek, prevMtdEnd, prevMonthEnd, chartStart: chartStartMonth };
};

export const getWeekBucket = (date: Date, mediaStart: Date): number => {
  const diff = Math.floor((date.getTime() - mediaStart.getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(diff / 7) + 1;
};