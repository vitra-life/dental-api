/**
 * Every page, feature and action of the product, as one tree. Each item can be
 * granted to a role. `npm run db:seed` copies this into the `permissions`
 * table: new items are added, labels updated, and items removed from here are
 * marked unassignable (their grants are kept but ignored).
 *
 * To add a page or action: add an entry here, and use its code in
 * `@RequirePermission(...)` (backend) or the app's menu and buttons.
 *
 * - Codes are dotted paths: page → feature → action.
 * - Granting an item does not grant its children; each is granted explicitly.
 * - An item only takes effect if its page (the first segment) is granted too.
 * - `scoped` items touch clinic data, so their grant carries a scope
 *   (own / assigned / clinic). For the others the scope is ignored.
 */

export type PermissionKind = 'page' | 'feature' | 'action';

export interface CatalogItem {
  code: string;
  kind: PermissionKind;
  /** Persian label for the roles screen. */
  label: string;
  description?: string;
  scoped?: boolean;
  children?: CatalogItem[];
}

const page = (
  code: string,
  label: string,
  children: CatalogItem[] = [],
): CatalogItem => ({ code, kind: 'page', label, children });
const feature = (
  code: string,
  label: string,
  children: CatalogItem[] = [],
): CatalogItem => ({ code, kind: 'feature', label, children });
const action = (
  code: string,
  label: string,
  scoped = false,
  description?: string,
): CatalogItem => ({
  code,
  kind: 'action',
  label,
  scoped,
  description,
});

export const PERMISSION_CATALOG: CatalogItem[] = [
  page('dashboard', 'داشبورد'),
  page('clients', 'بیماران', [
    feature('clients.list', 'فهرست بیماران', [
      action('clients.list.view', 'مشاهده فهرست بیماران', true),
    ]),
    feature('clients.record', 'پرونده بیمار', [
      action('clients.record.view', 'مشاهده پرونده بیمار', true),
      action('clients.record.create', 'ثبت بیمار جدید'),
      action('clients.record.update', 'ویرایش اطلاعات بیمار', true),
    ]),
    feature('clients.medical', 'اطلاعات پزشکی', [
      action(
        'clients.medical.view',
        'مشاهده اطلاعات پزشکی',
        true,
        'Defined for later; no endpoint uses it yet.',
      ),
    ]),
  ]),
  page('appointments', 'نوبت‌دهی', [
    feature('appointments.list', 'فهرست نوبت‌ها', [
      action('appointments.list.view', 'مشاهده نوبت‌ها', true),
    ]),
    feature('appointments.booking', 'ثبت و ویرایش نوبت', [
      action(
        'appointments.booking.create',
        'ثبت نوبت',
        true,
        'The scope limits which doctors can be booked.',
      ),
      action('appointments.booking.update', 'ویرایش یا جابه‌جایی نوبت', true),
    ]),
    feature('appointments.status', 'وضعیت نوبت', [
      action('appointments.status.change', 'تأیید، انجام‌شده یا غیبت', true),
      action('appointments.status.cancel', 'لغو نوبت', true),
    ]),
  ]),
  page('billing', 'صورتحساب'),
  page('lab', 'لابراتوار'),
  page('sms', 'پنل پیامک'),
  page('reports', 'گزارش‌ها'),
  page('assistant', 'دستیار هوشمند'),
  page('settings', 'تنظیمات', [
    feature('settings.clinic', 'اطلاعات کلینیک'),
    feature('settings.hours', 'ساعات کاری'),
    feature('settings.services', 'کاتالوگ خدمات', [
      action('settings.services.manage', 'افزودن، ویرایش و حذف خدمات'),
    ]),
    feature('settings.staff', 'پرسنل', [
      action('settings.staff.view', 'مشاهده پرسنل و ارتباط‌ها'),
      action('settings.staff.manage', 'مدیریت پرسنل و ارتباط‌ها'),
    ]),
    feature('settings.roles', 'نقش‌ها و دسترسی‌ها', [
      action('settings.roles.view', 'مشاهده نقش‌ها'),
      action('settings.roles.manage', 'مدیریت نقش‌ها و دسترسی‌ها'),
    ]),
    feature('settings.plans', 'الگوهای طرح درمان'),
    feature('settings.audit', 'گزارش رویدادها', [
      action('settings.audit.view', 'مشاهده گزارش رویدادها'),
    ]),
  ]),
  action(
    'prescriptions.create',
    'ثبت نسخه',
    true,
    'Defined for later; no endpoint uses it yet. Also needs a verified license.',
  ),
];

/** The catalogue as flat rows, parents first. */
export interface CatalogRow {
  code: string;
  kind: PermissionKind;
  parent_code: string | null;
  label: string;
  description: string | null;
  sort_order: number;
  scoped: boolean;
}

export function flattenCatalog(
  items: CatalogItem[] = PERMISSION_CATALOG,
): CatalogRow[] {
  const rows: CatalogRow[] = [];
  const walk = (list: CatalogItem[], parent: string | null) => {
    list.forEach((item) => {
      rows.push({
        code: item.code,
        kind: item.kind,
        parent_code: parent,
        label: item.label,
        description: item.description ?? null,
        sort_order: rows.length,
        scoped: item.scoped ?? false,
      });
      walk(item.children ?? [], item.code);
    });
  };
  walk(items, null);
  return rows;
}

const ROWS = flattenCatalog();
const BY_CODE = new Map(ROWS.map((row) => [row.code, row]));

/** Every catalogue code. */
export const CATALOG_CODES: readonly string[] = ROWS.map((row) => row.code);

export function catalogItem(code: string): CatalogRow | undefined {
  return BY_CODE.get(code);
}

/**
 * The page an item belongs to: its first path segment, if that is a page.
 * Root items that are not pages (e.g. `prescriptions.create`) have none.
 */
export function pageOf(code: string): string | null {
  const first = code.split('.')[0];
  return BY_CODE.get(first)?.kind === 'page' ? first : null;
}

/** The codes the backend checks, so a typo is a type error. */
export const P = {
  clientsListView: 'clients.list.view',
  clientsRecordView: 'clients.record.view',
  clientsRecordCreate: 'clients.record.create',
  clientsRecordUpdate: 'clients.record.update',
  appointmentsListView: 'appointments.list.view',
  appointmentsBookingCreate: 'appointments.booking.create',
  appointmentsBookingUpdate: 'appointments.booking.update',
  appointmentsStatusChange: 'appointments.status.change',
  appointmentsStatusCancel: 'appointments.status.cancel',
  servicesManage: 'settings.services.manage',
  staffView: 'settings.staff.view',
  staffManage: 'settings.staff.manage',
  rolesView: 'settings.roles.view',
  rolesManage: 'settings.roles.manage',
  auditView: 'settings.audit.view',
} as const;

export type PermissionCode = (typeof P)[keyof typeof P];
