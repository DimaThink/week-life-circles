import type { Lang } from '../index';

/** Starter week templates the settings can load. */
export type StarterPreset = 'minimal' | 'journal' | 'reflection';
export const STARTER_PRESETS: StarterPreset[] = ['minimal', 'journal', 'reflection'];

/** Translated headings and prompts the starter templates are built from. */
interface Words {
  happened: string;
  takeaways: string;
  photos: string;
  days: string;
  pulse: string;
  pulseQuestions: string[];
  plans: string;
  dayHeading: string;
}

const WORDS: Record<Lang, Words> = {
  en: {
    happened: 'What happened',
    takeaways: 'Takeaways',
    photos: 'Photos',
    days: 'Days',
    pulse: 'Pulse',
    pulseQuestions: ['I was running away into: ', 'What brought me back to myself: ', 'Next week I change one thing: '],
    plans: 'Plans',
    dayHeading: 'How the day went',
  },
  uk: {
    happened: 'Що сталося',
    takeaways: 'Висновки',
    photos: 'Фото',
    days: 'Дні',
    pulse: 'Пульс',
    pulseQuestions: ['Куди я втікав(-ла): ', 'Що повернуло мене до себе: ', 'Наступного тижня змінюю одне: '],
    plans: 'Плани',
    dayHeading: 'Як минув день',
  },
  pl: {
    happened: 'Co się wydarzyło',
    takeaways: 'Wnioski',
    photos: 'Zdjęcia',
    days: 'Dni',
    pulse: 'Puls',
    pulseQuestions: ['Uciekałem/am w: ', 'Co przywróciło mnie do siebie: ', 'W przyszłym tygodniu zmieniam jedną rzecz: '],
    plans: 'Plany',
    dayHeading: 'Jak minął dzień',
  },
};

const HEADER = '{{ww}}.{{yy}} {{circle}} {{date}} – {{weekEnd}}';

function build(w: Words, preset: StarterPreset): string {
  const section = (title: string, ...body: string[]): string[] => [`# ${title}`, '', ...body, ''];
  const lines = [HEADER, '', ...section(w.happened)];
  if (preset !== 'minimal') lines.push(...section(w.takeaways));
  lines.push(...section(w.photos, '{{photos}}'));
  if (preset !== 'minimal') {
    lines.push(...section(w.days, '{{days}}'));
    if (preset === 'reflection') lines.push(...section(w.pulse, ...w.pulseQuestions));
    lines.push(...section(w.plans, '* [ ] '));
  }
  return lines.join('\n');
}

interface StarterSet { minimal: string; journal: string; reflection: string; day: string }

function starterSet(lang: Lang): StarterSet {
  const w = WORDS[lang];
  return {
    minimal: build(w, 'minimal'),
    journal: build(w, 'journal'),
    reflection: build(w, 'reflection'),
    day: `# {{date}} · {{weekday}} {{circle}}\n\n## ${w.dayHeading}\n\n`,
  };
}

export const STARTER_TEMPLATES: Record<Lang, StarterSet> = {
  en: starterSet('en'),
  uk: starterSet('uk'),
  pl: starterSet('pl'),
};

export function starterWeekTemplate(preset: StarterPreset, lang: Lang): string {
  return STARTER_TEMPLATES[lang][preset];
}

export function starterDayTemplate(lang: Lang): string {
  return STARTER_TEMPLATES[lang].day;
}
