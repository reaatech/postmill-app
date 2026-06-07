'use client';

import React from 'react';
import { useCalendar } from './context';

// dayjs locale imports and setup
import 'dayjs/locale/en';
import 'dayjs/locale/he';
import 'dayjs/locale/ru';
import 'dayjs/locale/zh';
import 'dayjs/locale/fr';
import 'dayjs/locale/es';
import 'dayjs/locale/pt';
import 'dayjs/locale/de';
import 'dayjs/locale/it';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/ar';
import 'dayjs/locale/tr';
import 'dayjs/locale/vi';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { extend } from 'dayjs';
import dayjs from 'dayjs';
import i18next from 'i18next';

import { DayView } from './day.view';
import { WeekView } from './week.view';
import { MonthView } from './month.view';
import { ListView } from './list.view';

extend(isSameOrAfter);
extend(isSameOrBefore);
extend(localizedFormat);

const updateDayjsLocale = () => {
  const currentLanguage = i18next.resolvedLanguage || 'en';
  dayjs.locale(currentLanguage);
};

i18next.on('languageChanged', () => {
  updateDayjsLocale();
});

updateDayjsLocale();

export const Calendar = () => {
  const { display } = useCalendar();
  return (
    <>
      {display === 'list' ? (
        <ListView />
      ) : display === 'day' ? (
        <DayView />
      ) : display === 'week' ? (
        <WeekView />
      ) : (
        <MonthView />
      )}
    </>
  );
};

export { CalendarContext, CalendarWeekProvider, useCalendar } from './context';
export type { Integrations, ListStateFilter, EngagementFilter } from './context';

export { DayView } from './day.view';
export { WeekView } from './week.view';
export { MonthView } from './month.view';
export { ListView } from './list.view';
export { CalendarColumn, SetSelectionModal } from './grid';
export { CalendarItem } from './card';
export {
  IconButton,
  EditSettings,
  CopyDebug,
  Duplicate,
  Preview,
  Statistics,
  DeletePost,
} from './helpers';
export { CalendarHeader } from './header';
export { CalendarSidebar } from './sidebar';
