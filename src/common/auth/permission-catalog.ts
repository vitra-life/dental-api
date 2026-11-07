/**
 * Every action of the product, one grantable item each, grouped for display.
 * `npm run db:seed` copies this into the `permissions` table: new items are
 * added, labels updated, and items removed from here are marked unassignable
 * (their grants are kept but ignored).
 *
 * To add an action: add an item here, and use its code in
 * `@RequirePermission(...)` (backend) or on the app's button.
 *
 * - Codes are `resource.action`.
 * - Grants belong to a workspace, and the workspace decides whose data they
 *   reach (one doctor's, or the whole clinic's), so items carry no scope.
 * - The app shows a page when the workspace holds its `view` item.
 */

export interface CatalogItem {
  code: string;
  /** Persian label for the permissions screen. */
  label: string;
  description?: string;
}

export interface CatalogGroup {
  code: string;
  label: string;
  items: CatalogItem[];
}

const item = (
  code: string,
  label: string,
  description?: string,
): CatalogItem => ({
  code,
  label,
  description,
});
const group = (
  code: string,
  label: string,
  items: CatalogItem[],
): CatalogGroup => ({
  code,
  label,
  items,
});

/** Marks items whose screens still save in the browser: they hide buttons until the API exists. */
const LOCAL =
  'Not enforced by the API yet: the screen still saves in the browser.';

export const PERMISSION_CATALOG: CatalogGroup[] = [
  group('dashboard', 'داشبورد', [item('dashboard.view', 'مشاهده داشبورد')]),
  group('clients', 'بیماران', [
    item('client.view', 'مشاهده بیماران'),
    item('client.create', 'ثبت بیمار'),
    item('client.update', 'ویرایش بیمار'),
    item(
      'client.delete',
      'حذف بیمار',
      'Also cancels the client’s upcoming appointments.',
    ),
    item('medical_record.view', 'مشاهده پرونده پزشکی'),
  ]),
  group('appointments', 'نوبت‌ها', [
    item('appointment.view', 'مشاهده نوبت‌ها'),
    item('appointment.create', 'ثبت نوبت'),
    item('appointment.update', 'ویرایش یا جابه‌جایی نوبت'),
    item('appointment.confirm', 'تأیید نوبت'),
    item('appointment.complete', 'ثبت انجام نوبت'),
    item('appointment.no_show', 'ثبت غیبت'),
    item('appointment.cancel', 'لغو نوبت'),
    item('appointment.delete', 'حذف نوبت'),
  ]),
  group('services', 'خدمات', [
    item('service.view', 'مشاهده خدمات'),
    item('service.create', 'افزودن خدمت'),
    item('service.update', 'ویرایش خدمت'),
    item('service.delete', 'حذف خدمت'),
  ]),
  group('staff', 'پرسنل و جایگاه‌ها', [
    item('staff.view', 'مشاهده پرسنل و جایگاه‌ها'),
    item('staff.create', 'افزودن فرد'),
    item('staff.update', 'ویرایش فرد (سمت، فعال بودن)'),
    item('staff.reset_password', 'بازنشانی رمز عبور'),
    item('doctor_profile.update', 'ویرایش پروفایل پزشک'),
    item('workspace.create', 'افزودن جایگاه'),
    item('workspace.update', 'ویرایش جایگاه و دسترسی‌های آن'),
    item('workspace.delete', 'حذف جایگاه'),
  ]),
  group('templates', 'الگوهای دسترسی', [
    item('permission_template.view', 'مشاهده الگوها'),
    item('permission_template.create', 'ساخت الگو'),
    item('permission_template.update', 'ویرایش الگو'),
    item('permission_template.delete', 'حذف الگو'),
  ]),
  group('audit', 'گزارش رویدادها', [
    item('audit_log.view', 'مشاهده گزارش رویدادها'),
  ]),
  group('billing', 'صورتحساب', [
    item('invoice.view', 'مشاهده صورتحساب‌ها', LOCAL),
    item('invoice.create', 'صدور فاکتور', LOCAL),
    item('invoice.update', 'ویرایش فاکتور', LOCAL),
    item('payment.create', 'ثبت پرداخت', LOCAL),
    item('installment.pay', 'ثبت پرداخت قسط', LOCAL),
  ]),
  group('lab', 'لابراتوار', [
    item('lab_order.view', 'مشاهده سفارش‌های لابراتوار', LOCAL),
    item('lab_order.create', 'ثبت سفارش لابراتوار', LOCAL),
    item('lab_order.update', 'ویرایش سفارش لابراتوار', LOCAL),
    item('lab_payment.create', 'ثبت پرداخت به لابراتوار', LOCAL),
    item('lab.create', 'افزودن لابراتوار', LOCAL),
    item('lab.update', 'ویرایش لابراتوار', LOCAL),
  ]),
  group('sms', 'پیامک', [
    item('sms_campaign.view', 'مشاهده کمپین‌ها', LOCAL),
    item('sms_campaign.create', 'ساخت و ارسال کمپین', LOCAL),
    item('sms_campaign.update', 'ویرایش کمپین', LOCAL),
    item('sms_campaign.delete', 'حذف کمپین', LOCAL),
    item('sms_package.purchase', 'خرید بسته پیامک', LOCAL),
  ]),
  group('treatments', 'درمان', [
    item('treatment.view', 'مشاهده درمان‌ها', LOCAL),
    item('treatment.create', 'ثبت درمان', LOCAL),
    item('dental_chart.view', 'مشاهده چارت دندان', LOCAL),
    item('dental_chart.update', 'ویرایش چارت دندان', LOCAL),
    item('xray.view', 'مشاهده تصاویر رادیولوژی', LOCAL),
    item('xray.upload', 'افزودن تصویر رادیولوژی', LOCAL),
    item('xray.delete', 'حذف تصویر رادیولوژی', LOCAL),
  ]),
  group('treatment_plans', 'طرح درمان', [
    item('treatment_plan.view', 'مشاهده طرح‌های درمان', LOCAL),
    item('treatment_plan.create', 'ساخت طرح درمان', LOCAL),
    item('treatment_plan.update', 'ویرایش طرح درمان', LOCAL),
    item('treatment_plan.delete', 'حذف طرح درمان', LOCAL),
    item('treatment_plan_template.view', 'مشاهده الگوهای طرح درمان', LOCAL),
    item('treatment_plan_template.create', 'ساخت الگوی طرح درمان', LOCAL),
    item('treatment_plan_template.update', 'ویرایش الگوی طرح درمان', LOCAL),
    item('treatment_plan_template.delete', 'حذف الگوی طرح درمان', LOCAL),
  ]),
  group('prescriptions', 'نسخه', [
    item(
      'prescription.create',
      'ثبت نسخه',
      'Defined for later; no endpoint uses it yet.',
    ),
  ]),
  group('clinic_settings', 'تنظیمات کلینیک', [
    item('clinic_settings.view', 'مشاهده تنظیمات کلینیک', LOCAL),
    item(
      'clinic_settings.update',
      'ویرایش اطلاعات، ساعات کاری و اعلان‌ها',
      LOCAL,
    ),
  ]),
  group('reports', 'گزارش‌ها و دستیار', [
    item('report.view', 'مشاهده گزارش‌ها', LOCAL),
    item('assistant.view', 'استفاده از دستیار هوشمند', LOCAL),
  ]),
];

/** The catalogue as flat rows in display order. */
export interface CatalogRow {
  code: string;
  group_code: string;
  label: string;
  description: string | null;
  sort_order: number;
}

export function flattenCatalog(
  groups: CatalogGroup[] = PERMISSION_CATALOG,
): CatalogRow[] {
  return groups
    .flatMap((g) => g.items.map((it) => ({ ...it, group_code: g.code })))
    .map((it, index) => ({
      code: it.code,
      group_code: it.group_code,
      label: it.label,
      description: it.description ?? null,
      sort_order: index,
    }));
}

const ROWS = flattenCatalog();

/** Every catalogue code. */
export const CATALOG_CODES: readonly string[] = ROWS.map((row) => row.code);

export const isCatalogCode = (code: string) => CATALOG_CODES.includes(code);

/**
 * The tree catalogue's codes (before 2026-11) and the per-action items that
 * replace them, so the seed can move a clinic's template grants across.
 */
export const LEGACY_CODES: Record<string, string[]> = {
  dashboard: ['dashboard.view'],
  clients: ['client.view'],
  'clients.list': ['client.view'],
  'clients.list.view': ['client.view'],
  'clients.record': ['client.view'],
  'clients.record.view': ['client.view'],
  'clients.record.create': ['client.create'],
  'clients.record.update': ['client.update'],
  'clients.medical': ['medical_record.view'],
  'clients.medical.view': ['medical_record.view'],
  appointments: ['appointment.view'],
  'appointments.list': ['appointment.view'],
  'appointments.list.view': ['appointment.view'],
  'appointments.booking': ['appointment.view'],
  'appointments.booking.create': ['appointment.create'],
  'appointments.booking.update': ['appointment.update'],
  'appointments.status': ['appointment.view'],
  'appointments.status.change': [
    'appointment.confirm',
    'appointment.complete',
    'appointment.no_show',
  ],
  'appointments.status.cancel': ['appointment.cancel'],
  billing: ['invoice.view'],
  lab: ['lab_order.view'],
  sms: ['sms_campaign.view'],
  reports: ['report.view'],
  assistant: ['assistant.view'],
  'settings.clinic': ['clinic_settings.view'],
  'settings.hours': ['clinic_settings.view'],
  'settings.services': ['service.view'],
  'settings.services.manage': [
    'service.create',
    'service.update',
    'service.delete',
  ],
  'settings.staff': ['staff.view'],
  'settings.staff.view': ['staff.view'],
  'settings.staff.manage': [
    'staff.create',
    'staff.update',
    'staff.reset_password',
    'doctor_profile.update',
    'workspace.create',
    'workspace.update',
    'workspace.delete',
  ],
  'settings.roles': ['permission_template.view'],
  'settings.roles.view': ['permission_template.view'],
  'settings.roles.manage': [
    'permission_template.create',
    'permission_template.update',
    'permission_template.delete',
  ],
  'settings.plans': ['treatment_plan_template.view'],
  'settings.audit': ['audit_log.view'],
  'settings.audit.view': ['audit_log.view'],
  'prescriptions.create': ['prescription.create'],
};

/** The codes the backend checks, so a typo is a type error. */
export const P = {
  clientView: 'client.view',
  clientCreate: 'client.create',
  clientUpdate: 'client.update',
  clientDelete: 'client.delete',
  appointmentView: 'appointment.view',
  appointmentCreate: 'appointment.create',
  appointmentUpdate: 'appointment.update',
  appointmentConfirm: 'appointment.confirm',
  appointmentComplete: 'appointment.complete',
  appointmentNoShow: 'appointment.no_show',
  appointmentCancel: 'appointment.cancel',
  appointmentDelete: 'appointment.delete',
  serviceView: 'service.view',
  serviceCreate: 'service.create',
  serviceUpdate: 'service.update',
  serviceDelete: 'service.delete',
  staffView: 'staff.view',
  staffCreate: 'staff.create',
  staffUpdate: 'staff.update',
  staffResetPassword: 'staff.reset_password',
  doctorProfileUpdate: 'doctor_profile.update',
  workspaceCreate: 'workspace.create',
  workspaceUpdate: 'workspace.update',
  workspaceDelete: 'workspace.delete',
  templateView: 'permission_template.view',
  templateCreate: 'permission_template.create',
  templateUpdate: 'permission_template.update',
  templateDelete: 'permission_template.delete',
  auditView: 'audit_log.view',
} as const;

export type PermissionCode = (typeof P)[keyof typeof P];
