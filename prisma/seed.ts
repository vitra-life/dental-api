/**
 * Development data: one clinic with the frontend's former sample clients,
 * services and appointments. Run with `npm run db:seed`; it replaces the dev
 * clinic's rows each time and touches no other clinic.
 *
 * Ids are fixed so the frontend can point at them: the clinic id is
 * `VITE_CLINIC_ID` in Dental-App, and the remaining local sample data there
 * (invoices, treatments, lab orders...) refers to these client, service and
 * appointment ids.
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import {
  PrismaClient,
  type AppointmentStatus,
  type ServiceCategory,
} from '../src/generated/prisma/client.js';
import { isValidNationalId } from '../src/common/validators/national-id.js';

if (process.env['NODE_ENV'] === 'production') {
  throw new Error('The dev seed must not run in production');
}
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

export const DEV_CLINIC_ID = '00000000-0000-7000-8000-000000000001';

/** `00000000-0000-7000-8000-000000000NNN`, with NNN = group * 100 + n. */
const fixedId = (group: number, n: number) =>
  `00000000-0000-7000-8000-${String(group * 100 + n).padStart(12, '0')}`;
const clientId = (n: number) => fixedId(1, n);
const serviceId = (n: number) => fixedId(2, n);
const appointmentId = (n: number) => fixedId(3, n);

const DAY = 24 * 60 * 60 * 1000;
const TOMAN = 10; // prices below are in Toman, the database stores Rial

/** `YYYY-MM-DD` in Iran, `days` from today. */
function iranDate(days: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(
    new Date(Date.now() + days * DAY),
  );
}

/** A moment given as an Iran wall-clock time (Iran has no DST since 2022). */
const iranTime = (days: number, time: string) =>
  new Date(`${iranDate(days)}T${time}:00+03:30`);

/** The sample ids have a wrong check digit; replace it so the API accepts edits. */
function fixNationalId(id: string): string {
  for (let digit = 0; digit <= 9; digit++) {
    const candidate = id.slice(0, 9) + digit;
    if (isValidNationalId(candidate)) return candidate;
  }
  throw new Error(`No valid national id for ${id}`);
}

// prettier-ignore
const services: [
  number,
  string,
  ServiceCategory,
  number,
  number,
  string | null,
  boolean,
][] = [
  [1, 'ویزیت و معاینه', 'general', 300_000, 30, 'معاینه کامل دهان و دندان و تشکیل پرونده', true],
  [2, 'جرمگیری و بروساژ', 'general', 1_200_000, 45, null, true],
  [3, 'ترمیم کامپوزیت', 'general', 2_500_000, 45, 'پر کردن دندان با کامپوزیت همرنگ', true],
  [4, 'عصب‌کشی', 'endodontics', 6_000_000, 60, 'درمان ریشه دندان‌های خلفی', true],
  [5, 'کشیدن دندان', 'surgery', 1_500_000, 30, null, true],
  [6, 'جراحی دندان عقل', 'surgery', 4_500_000, 60, 'جراحی دندان عقل نهفته', true],
  [7, 'روکش زیرکونیا', 'prosthodontics', 12_000_000, 60, null, true],
  [8, 'ایمپلنت', 'surgery', 35_000_000, 90, 'ایمپلنت با فیکسچر کره‌ای', true],
  [9, 'بلیچینگ', 'cosmetic', 5_000_000, 60, 'سفید کردن دندان در مطب', true],
  [10, 'ارتودنسی ثابت', 'orthodontics', 60_000_000, 45, null, true],
  [11, 'لمینت سرامیکی', 'cosmetic', 9_000_000, 60, 'هزینه به ازای هر واحد', false],
];

type ClientSeed = {
  n: number;
  first_name: string;
  last_name: string;
  national_id: string;
  phone: string;
  birth_date: string;
  gender: 'male' | 'female';
  /** Days ago the client was registered. */
  since: number;
  email?: string;
  address?: string;
  blood_type?: string;
  allergies?: string;
  medical_history?: string;
  emergency_contact?: string;
  emergency_phone?: string;
  insurance_company?: string;
  insurance_number?: string;
  notes?: string;
};

// prettier-ignore
const clients: ClientSeed[] = [
  { n: 1, first_name: 'محمد', last_name: 'حسینی', national_id: '0012345678', phone: '09121110001', birth_date: '1985-04-12', gender: 'male', since: 320, email: 'm.hosseini@example.com', address: 'تهران، سعادت‌آباد', blood_type: 'O+', allergies: 'پنی‌سیلین', insurance_company: 'بیمه دی', insurance_number: 'D-448120' },
  { n: 2, first_name: 'فاطمه', last_name: 'محمدی', national_id: '0023456789', phone: '09121110002', birth_date: '1992-09-03', gender: 'female', since: 210, address: 'تهران، ونک', blood_type: 'A+', emergency_contact: 'حسین محمدی', emergency_phone: '09121119002' },
  { n: 3, first_name: 'علیرضا', last_name: 'کاظمی', national_id: '0034567890', phone: '09121110003', birth_date: '1978-01-25', gender: 'male', since: 180, medical_history: 'فشار خون بالا - مصرف لوزارتان', insurance_company: 'بیمه ایران', insurance_number: 'IR-99315' },
  { n: 4, first_name: 'زهرا', last_name: 'رحیمی', national_id: '0045678901', phone: '09121110004', birth_date: '2001-06-30', gender: 'female', since: 45 },
  { n: 5, first_name: 'امیر', last_name: 'نوری', national_id: '0056789012', phone: '09121110005', birth_date: '1995-11-18', gender: 'male', since: 140, email: 'amir.nouri@example.com' },
  { n: 6, first_name: 'مریم', last_name: 'صادقی', national_id: '0067890123', phone: '09121110006', birth_date: '1969-03-08', gender: 'female', since: 260, medical_history: 'دیابت نوع ۲', allergies: 'لاتکس', emergency_contact: 'نادر صادقی', emergency_phone: '09121119006' },
  { n: 7, first_name: 'حسین', last_name: 'جعفری', national_id: '0078901234', phone: '09121110007', birth_date: '1988-12-02', gender: 'male', since: 300 },
  { n: 8, first_name: 'نرگس', last_name: 'اکبری', national_id: '0089012345', phone: '09121110008', birth_date: '1999-02-14', gender: 'female', since: 12, insurance_company: 'بیمه آسیا', insurance_number: 'AS-51007' },
  { n: 9, first_name: 'رضا', last_name: 'مرادی', national_id: '0090123456', phone: '09121110009', birth_date: '1982-07-21', gender: 'male', since: 60 },
  { n: 10, first_name: 'سمیرا', last_name: 'قاسمی', national_id: '0101234567', phone: '09121110010', birth_date: '1990-05-09', gender: 'female', since: 40, notes: 'ترجیح نوبت‌های صبح' },
  { n: 11, first_name: 'کامران', last_name: 'یوسفی', national_id: '0112345678', phone: '09121110011', birth_date: '1975-10-11', gender: 'male', since: 380 },
  { n: 12, first_name: 'لیلا', last_name: 'بهرامی', national_id: '0123456780', phone: '09121110012', birth_date: '2010-08-27', gender: 'female', since: 3, emergency_contact: 'پروین بهرامی (مادر)', emergency_phone: '09121119012' },
];

// prettier-ignore
// [n, client, service, day from today, start, end, status, price in Toman, description]
const appointments: [
  number,
  number,
  number,
  number,
  string,
  string,
  AppointmentStatus,
  number,
  string?,
][] = [
  // Older visits
  [1, 1, 3, -150, '10:00', '10:45', 'completed', 2_800_000],
  [2, 11, 1, -240, '11:00', '11:30', 'completed', 300_000],
  [3, 7, 6, -100, '14:00', '15:00', 'completed', 4_500_000],
  [4, 6, 8, -70, '09:00', '10:30', 'completed', 35_000_000],
  [5, 5, 9, -65, '16:00', '17:00', 'completed', 5_000_000],
  [6, 2, 7, -40, '12:00', '13:00', 'completed', 12_000_000],
  [7, 10, 5, -35, '10:00', '10:30', 'completed', 1_500_000],
  [8, 3, 4, -20, '15:00', '16:00', 'completed', 6_300_000],
  [9, 1, 2, -10, '09:30', '10:15', 'completed', 1_200_000],
  // Last week
  [10, 9, 3, -6, '11:00', '11:45', 'completed', 2_500_000],
  [11, 5, 1, -5, '09:00', '09:30', 'no_show', 300_000],
  [12, 4, 2, -3, '13:00', '13:45', 'completed', 1_200_000],
  [13, 7, 1, -3, '10:00', '10:30', 'cancelled', 300_000, 'بیمار تماس گرفت و لغو کرد'],
  [14, 12, 1, -2, '16:00', '16:30', 'completed', 300_000],
  [15, 8, 5, -1, '14:00', '14:30', 'completed', 1_800_000],
  [16, 2, 1, -1, '17:00', '17:30', 'completed', 300_000, 'کنترل روکش'],
  // Today
  [17, 3, 4, 0, '09:00', '10:00', 'completed', 6_000_000, 'جلسه دوم درمان ریشه'],
  [18, 6, 1, 0, '10:00', '10:30', 'completed', 300_000, 'کنترل ایمپلنت'],
  [19, 10, 2, 0, '11:00', '11:45', 'confirmed', 1_200_000],
  [20, 12, 3, 0, '13:30', '14:15', 'pending', 2_500_000],
  [21, 8, 9, 0, '15:00', '16:00', 'pending', 5_000_000],
  [22, 9, 1, 0, '16:30', '17:00', 'cancelled', 300_000],
  // Upcoming
  [23, 1, 7, 1, '09:30', '10:30', 'confirmed', 12_000_000],
  [24, 4, 3, 1, '12:00', '12:45', 'pending', 2_500_000],
  [25, 6, 7, 2, '10:00', '11:00', 'confirmed', 12_000_000],
  [26, 5, 2, 4, '17:00', '17:45', 'pending', 1_200_000],
  [27, 2, 4, 6, '14:00', '15:00', 'pending', 6_000_000],
  [28, 12, 10, 9, '11:00', '11:45', 'pending', 60_000_000, 'مشاوره ارتودنسی'],
];

async function main(prisma: PrismaClient) {
  const clinic_id = DEV_CLINIC_ID;
  await prisma.$transaction([
    prisma.appointment.deleteMany({ where: { clinic_id } }),
    prisma.client.deleteMany({ where: { clinic_id } }),
    prisma.service.deleteMany({ where: { clinic_id } }),
    prisma.clinic.upsert({
      where: { id: clinic_id },
      create: { id: clinic_id, name: 'کلینیک دندانپزشکی ویترا (توسعه)' },
      update: {},
    }),
    prisma.service.createMany({
      data: services.map(
        ([
          n,
          name,
          category,
          price,
          duration_minutes,
          description,
          active,
        ]) => ({
          id: serviceId(n),
          clinic_id,
          name,
          category,
          default_price: price * TOMAN,
          duration_minutes,
          description,
          active,
          created_at: new Date(Date.now() - 400 * DAY),
        }),
      ),
    }),
    prisma.client.createMany({
      data: clients.map(({ n, since, national_id, birth_date, ...client }) => ({
        ...client,
        id: clientId(n),
        clinic_id,
        national_id: fixNationalId(national_id),
        birth_date: new Date(`${birth_date}T00:00:00Z`),
        created_at: new Date(Date.now() - since * DAY),
      })),
    }),
    prisma.appointment.createMany({
      data: appointments.map(
        ([
          n,
          client,
          service,
          day,
          start,
          end,
          status,
          price,
          description,
        ]) => ({
          id: appointmentId(n),
          clinic_id,
          client_id: clientId(client),
          service_id: serviceId(service),
          start_time: iranTime(day, start),
          end_time: iranTime(day, end),
          status,
          price: price * TOMAN,
          description: description ?? null,
          created_at: new Date(Date.now() + (Math.min(day, 0) - 7) * DAY),
        }),
      ),
    }),
  ]);
  console.log(
    `Seeded clinic ${clinic_id}: ${services.length} services, ${clients.length} clients, ${appointments.length} appointments`,
  );
}

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });
try {
  await main(prisma);
} finally {
  await prisma.$disconnect();
}
