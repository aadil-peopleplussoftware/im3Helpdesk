/**
 * Curated, business-friendly list of timezones modelled after Rails
 * ActiveSupport's `ActiveSupport::TimeZone::MAPPING`. Every entry stores:
 *
 *  - `iana`  : the real IANA zone we persist & feed into Angular's
 *              `date` pipe (e.g. `Asia/Kolkata`). Stable, DST-aware.
 *  - `city`  : the friendly display name shown in the picker
 *              (e.g. `Kolkata`, `New Delhi`, `Pacific Time (US & Canada)`).
 *
 * Multiple cities can legitimately map to the same IANA zone (Mumbai,
 * Chennai, New Delhi, Kolkata all share `Asia/Kolkata`); the picker
 * lets the user choose by city while the backend still receives a
 * canonical IANA value.
 *
 * GMT offsets are NOT hard-coded \u2014 we compute them on demand with
 * `Intl.DateTimeFormat` so DST is always accurate.
 */
export interface TimezoneOption {
  /** IANA identifier persisted to the backend. */
  iana: string;
  /** Friendly city / region label shown to the user. */
  city: string;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { city: 'International Date Line West', iana: 'Etc/GMT+12' },
  { city: 'American Samoa',                iana: 'Pacific/Pago_Pago' },
  { city: 'Midway Island',                 iana: 'Pacific/Midway' },
  { city: 'Hawaii',                        iana: 'Pacific/Honolulu' },
  { city: 'Alaska',                        iana: 'America/Juneau' },
  { city: 'Pacific Time (US & Canada)',    iana: 'America/Los_Angeles' },
  { city: 'Tijuana',                       iana: 'America/Tijuana' },
  { city: 'Arizona',                       iana: 'America/Phoenix' },
  { city: 'Mazatlan',                      iana: 'America/Mazatlan' },
  { city: 'Mountain Time (US & Canada)',   iana: 'America/Denver' },
  { city: 'Central America',               iana: 'America/Guatemala' },
  { city: 'Chihuahua',                     iana: 'America/Chihuahua' },
  { city: 'Guadalajara',                   iana: 'America/Mexico_City' },
  { city: 'Mexico City',                   iana: 'America/Mexico_City' },
  { city: 'Monterrey',                     iana: 'America/Monterrey' },
  { city: 'Saskatchewan',                  iana: 'America/Regina' },
  { city: 'Central Time (US & Canada)',    iana: 'America/Chicago' },
  { city: 'Bogota',                        iana: 'America/Bogota' },
  { city: 'Lima',                          iana: 'America/Lima' },
  { city: 'Quito',                         iana: 'America/Lima' },
  { city: 'Eastern Time (US & Canada)',    iana: 'America/New_York' },
  { city: 'Indiana (East)',                iana: 'America/Indiana/Indianapolis' },
  { city: 'Caracas',                       iana: 'America/Caracas' },
  { city: 'Georgetown',                    iana: 'America/Guyana' },
  { city: 'La Paz',                        iana: 'America/La_Paz' },
  { city: 'Puerto Rico',                   iana: 'America/Puerto_Rico' },
  { city: 'Santiago',                      iana: 'America/Santiago' },
  { city: 'Atlantic Time (Canada)',        iana: 'America/Halifax' },
  { city: 'Brasilia',                      iana: 'America/Sao_Paulo' },
  { city: 'Buenos Aires',                  iana: 'America/Argentina/Buenos_Aires' },
  { city: 'Montevideo',                    iana: 'America/Montevideo' },
  { city: 'Newfoundland',                  iana: 'America/St_Johns' },
  { city: 'Mid-Atlantic',                  iana: 'Atlantic/South_Georgia' },
  { city: 'Greenland',                     iana: 'America/Godthab' },
  { city: 'Cape Verde Is.',                iana: 'Atlantic/Cape_Verde' },
  { city: 'Azores',                        iana: 'Atlantic/Azores' },
  { city: 'Monrovia',                      iana: 'Africa/Monrovia' },
  { city: 'UTC',                           iana: 'Etc/UTC' },
  { city: 'Edinburgh',                     iana: 'Europe/London' },
  { city: 'Lisbon',                        iana: 'Europe/Lisbon' },
  { city: 'London',                        iana: 'Europe/London' },
  { city: 'Casablanca',                    iana: 'Africa/Casablanca' },
  { city: 'Dublin',                        iana: 'Europe/Dublin' },
  { city: 'West Central Africa',           iana: 'Africa/Algiers' },
  { city: 'Amsterdam',                     iana: 'Europe/Amsterdam' },
  { city: 'Belgrade',                      iana: 'Europe/Belgrade' },
  { city: 'Berlin',                        iana: 'Europe/Berlin' },
  { city: 'Bern',                          iana: 'Europe/Zurich' },
  { city: 'Bratislava',                    iana: 'Europe/Bratislava' },
  { city: 'Brussels',                      iana: 'Europe/Brussels' },
  { city: 'Budapest',                      iana: 'Europe/Budapest' },
  { city: 'Copenhagen',                    iana: 'Europe/Copenhagen' },
  { city: 'Ljubljana',                     iana: 'Europe/Ljubljana' },
  { city: 'Madrid',                        iana: 'Europe/Madrid' },
  { city: 'Paris',                         iana: 'Europe/Paris' },
  { city: 'Prague',                        iana: 'Europe/Prague' },
  { city: 'Rome',                          iana: 'Europe/Rome' },
  { city: 'Sarajevo',                      iana: 'Europe/Sarajevo' },
  { city: 'Skopje',                        iana: 'Europe/Skopje' },
  { city: 'Stockholm',                     iana: 'Europe/Stockholm' },
  { city: 'Vienna',                        iana: 'Europe/Vienna' },
  { city: 'Warsaw',                        iana: 'Europe/Warsaw' },
  { city: 'Zagreb',                        iana: 'Europe/Zagreb' },
  { city: 'Zurich',                        iana: 'Europe/Zurich' },
  { city: 'Harare',                        iana: 'Africa/Harare' },
  { city: 'Kaliningrad',                   iana: 'Europe/Kaliningrad' },
  { city: 'Pretoria',                      iana: 'Africa/Johannesburg' },
  { city: 'Athens',                        iana: 'Europe/Athens' },
  { city: 'Bucharest',                     iana: 'Europe/Bucharest' },
  { city: 'Cairo',                         iana: 'Africa/Cairo' },
  { city: 'Helsinki',                      iana: 'Europe/Helsinki' },
  { city: 'Jerusalem',                     iana: 'Asia/Jerusalem' },
  { city: 'Kyiv',                          iana: 'Europe/Kyiv' },
  { city: 'Riga',                          iana: 'Europe/Riga' },
  { city: 'Sofia',                         iana: 'Europe/Sofia' },
  { city: 'Tallinn',                       iana: 'Europe/Tallinn' },
  { city: 'Vilnius',                       iana: 'Europe/Vilnius' },
  { city: 'Baghdad',                       iana: 'Asia/Baghdad' },
  { city: 'Istanbul',                      iana: 'Europe/Istanbul' },
  { city: 'Kuwait',                        iana: 'Asia/Kuwait' },
  { city: 'Minsk',                         iana: 'Europe/Minsk' },
  { city: 'Moscow',                        iana: 'Europe/Moscow' },
  { city: 'Nairobi',                       iana: 'Africa/Nairobi' },
  { city: 'Qatar',                         iana: 'Asia/Qatar' },
  { city: 'Riyadh',                        iana: 'Asia/Riyadh' },
  { city: 'St. Petersburg',                iana: 'Europe/Moscow' },
  { city: 'Volgograd',                     iana: 'Europe/Volgograd' },
  { city: 'Tehran',                        iana: 'Asia/Tehran' },
  { city: 'Abu Dhabi',                     iana: 'Asia/Muscat' },
  { city: 'Baku',                          iana: 'Asia/Baku' },
  { city: 'Dubai',                         iana: 'Asia/Dubai' },
  { city: 'Muscat',                        iana: 'Asia/Muscat' },
  { city: 'Samara',                        iana: 'Europe/Samara' },
  { city: 'Tbilisi',                       iana: 'Asia/Tbilisi' },
  { city: 'Yerevan',                       iana: 'Asia/Yerevan' },
  { city: 'Kabul',                         iana: 'Asia/Kabul' },
  { city: 'Almaty',                        iana: 'Asia/Almaty' },
  { city: 'Ekaterinburg',                  iana: 'Asia/Yekaterinburg' },
  { city: 'Islamabad',                     iana: 'Asia/Karachi' },
  { city: 'Karachi',                       iana: 'Asia/Karachi' },
  { city: 'Tashkent',                      iana: 'Asia/Tashkent' },
  { city: 'Chennai',                       iana: 'Asia/Kolkata' },
  { city: 'Kolkata',                       iana: 'Asia/Kolkata' },
  { city: 'Mumbai',                        iana: 'Asia/Kolkata' },
  { city: 'New Delhi',                     iana: 'Asia/Kolkata' },
  { city: 'Sri Jayawardenepura',           iana: 'Asia/Colombo' },
  { city: 'Kathmandu',                     iana: 'Asia/Kathmandu' },
  { city: 'Astana',                        iana: 'Asia/Almaty' },
  { city: 'Dhaka',                         iana: 'Asia/Dhaka' },
  { city: 'Urumqi',                        iana: 'Asia/Urumqi' },
  { city: 'Rangoon',                       iana: 'Asia/Yangon' },
  { city: 'Bangkok',                       iana: 'Asia/Bangkok' },
  { city: 'Hanoi',                         iana: 'Asia/Bangkok' },
  { city: 'Jakarta',                       iana: 'Asia/Jakarta' },
  { city: 'Krasnoyarsk',                   iana: 'Asia/Krasnoyarsk' },
  { city: 'Novosibirsk',                   iana: 'Asia/Novosibirsk' },
  { city: 'Beijing',                       iana: 'Asia/Shanghai' },
  { city: 'Chongqing',                     iana: 'Asia/Shanghai' },
  { city: 'Hong Kong',                     iana: 'Asia/Hong_Kong' },
  { city: 'Irkutsk',                       iana: 'Asia/Irkutsk' },
  { city: 'Kuala Lumpur',                  iana: 'Asia/Kuala_Lumpur' },
  { city: 'Perth',                         iana: 'Australia/Perth' },
  { city: 'Singapore',                     iana: 'Asia/Singapore' },
  { city: 'Taipei',                        iana: 'Asia/Taipei' },
  { city: 'Ulaanbaatar',                   iana: 'Asia/Ulaanbaatar' },
  { city: 'Osaka',                         iana: 'Asia/Tokyo' },
  { city: 'Sapporo',                       iana: 'Asia/Tokyo' },
  { city: 'Seoul',                         iana: 'Asia/Seoul' },
  { city: 'Tokyo',                         iana: 'Asia/Tokyo' },
  { city: 'Yakutsk',                       iana: 'Asia/Yakutsk' },
  { city: 'Adelaide',                      iana: 'Australia/Adelaide' },
  { city: 'Darwin',                        iana: 'Australia/Darwin' },
  { city: 'Brisbane',                      iana: 'Australia/Brisbane' },
  { city: 'Canberra',                      iana: 'Australia/Melbourne' },
  { city: 'Guam',                          iana: 'Pacific/Guam' },
  { city: 'Hobart',                        iana: 'Australia/Hobart' },
  { city: 'Melbourne',                     iana: 'Australia/Melbourne' },
  { city: 'Port Moresby',                  iana: 'Pacific/Port_Moresby' },
  { city: 'Sydney',                        iana: 'Australia/Sydney' },
  { city: 'Vladivostok',                   iana: 'Asia/Vladivostok' },
  { city: 'Magadan',                       iana: 'Asia/Magadan' },
  { city: 'New Caledonia',                 iana: 'Pacific/Noumea' },
  { city: 'Solomon Is.',                   iana: 'Pacific/Guadalcanal' },
  { city: 'Srednekolymsk',                 iana: 'Asia/Srednekolymsk' },
  { city: 'Auckland',                      iana: 'Pacific/Auckland' },
  { city: 'Fiji',                          iana: 'Pacific/Fiji' },
  { city: 'Kamchatka',                     iana: 'Asia/Kamchatka' },
  { city: 'Marshall Is.',                  iana: 'Pacific/Majuro' },
  { city: 'Wellington',                    iana: 'Pacific/Auckland' },
  { city: 'Chatham Is.',                   iana: 'Pacific/Chatham' },
  { city: "Nuku'alofa",                    iana: 'Pacific/Tongatapu' },
  { city: 'Samoa',                         iana: 'Pacific/Apia' },
  { city: 'Tokelau Is.',                   iana: 'Pacific/Fakaofo' }
];

/**
 * Returns the live "(GMT\u00b1HH:MM)" prefix for an IANA zone, calculated
 * from the current instant via `Intl.DateTimeFormat`. This automatically
 * accounts for daylight-saving transitions, so the displayed offset
 * always matches what dates rendered through Angular's `date` pipe will
 * actually use.
 */
export function getGmtOffset(iana: string, now: Date = new Date()): string {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      timeZoneName: 'longOffset'
    });
    const parts = dtf.formatToParts(now);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value || '';
    // longOffset returns "GMT+05:30", "GMT" (for UTC) or similar. Normalize.
    if (tzPart === 'GMT') return 'GMT+00:00';
    return tzPart.replace(/^UTC/, 'GMT');
  } catch {
    return 'GMT';
  }
}

/** Composite label e.g. `"(GMT+05:30) Kolkata"`. */
export function getTimezoneLabel(
  opt: TimezoneOption,
  now: Date = new Date()
): string {
  return `(${getGmtOffset(opt.iana, now)}) ${opt.city}`;
}

/**
 * Numeric sort key for an IANA zone, e.g. `+05:30` -> 330. Used to keep
 * the dropdown ordered from West (negative offsets) to East.
 */
export function getOffsetMinutes(iana: string, now: Date = new Date()): number {
  const off = getGmtOffset(iana, now); // "GMT+05:30" / "GMT-08:00"
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(off);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
}
