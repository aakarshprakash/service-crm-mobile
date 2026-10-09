/** API shapes used by the technician app (subset of the web app's types). */

export type JobStatus = 'open' | 'in_progress' | 'pending' | 'completed' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high';

export interface Named {
  id: number;
  name: string;
}

export interface Tenant {
  id: number;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  online_payments: boolean;
  require_signature?: boolean;
}

export interface User {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'admin' | 'coordinator' | 'accountant' | 'technician';
  role_label: string;
  branch_id: number | null;
  punch_status: 'in' | 'out';
  punched_at: string | null;
  abilities: string[];
  tenant: Tenant | null;
}

export interface Customer {
  id: number;
  crm_id: string | null;
  name: string;
  phone: string;
  alt_phone: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  location_updated_at?: string | null;
  location_source?: 'customer' | 'office' | 'technician' | null;
}

export interface CustomerProduct {
  id: number;
  serial_no: string | null;
  outdoor_serial_no: string | null;
  purchase_date: string | null;
  warranty_type: string | null;
  under_warranty?: boolean;
  product?: { id: number; model_name: string; brand?: Named | null } | null;
  dealer?: Named | null;
}

export interface Usage {
  id: number;
  item_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  item?: { id: number; code: string; name: string; unit_of_measure: string };
}

export interface JobImage {
  id: number;
  type: string;
  url: string;
}

export interface Visit {
  id: number;
  job_id: number;
  service_type: string;
  start_time: string;
  end_time: string | null;
  status: string;
  service_summary: string | null;
  labour_charge: number;
  spare_charge: number;
  total_charge: number;
  payment_method: string | null;
  amount_collected: number;
  signer_name?: string | null;
  signed_at?: string | null;
  technician?: Named;
  inventory_usage?: Usage[];
  images?: JobImage[];
  voice_notes?: VoiceNote[];
}

export interface VoiceNote {
  id: number;
  job_visit_id: number | null;
  duration_seconds: number;
  url: string;
  created_at: string;
}

export interface ExpenseClaim {
  id: number;
  job_id: number | null;
  expense_category_id: number;
  claim_date: string;
  amount: number;
  paid_from: 'cash_in_hand' | 'own_money';
  description: string | null;
  receipt_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  decision_note: string | null;
  cash_close_id: number | null;
  category?: Named | null;
  job?: { id: number; crm_call_id: string } | null;
}

export interface Payment {
  id: number;
  amount: number;
  method: string;
  receipt_number: string | null;
  reference_no: string | null;
  status: string;
  paid_at: string | null;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  branch_id?: number | null;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  upi?: { vpa: string; payee_name: string; amount: number; link: string } | null;
}

export interface Job {
  id: number;
  crm_call_id: string;
  status: JobStatus;
  priority: Priority;
  call_type: string;
  scheduled_at: string | null;
  branch_id: number | null;
  complaint_type_id: number | null;
  complaint_details: string | null;
  customer?: Customer;
  customer_product?: CustomerProduct | null;
  complaint_type?: Named | null;
  complaint_summary?: Named | null;
  service_location?: Named | null;
  visits?: Visit[];
  invoice?: Invoice | null;
}

export interface InventoryItem {
  id: number;
  code: string;
  name: string;
  type: 'spare' | 'consumable';
  unit_of_measure: string;
  unit_price: number;
  stock_total?: number | string | null;
}

export interface UpiAccount {
  id: number;
  name: string;
  vpa: string;
  payee_name: string;
  branch_id: number | null;
  is_default: boolean;
}

export interface Lookups {
  complaint_types: Named[];
  action_taken_options: Named[];
  upi_accounts?: UpiAccount[];
  expense_categories?: Named[];
  leave_types?: { id: number; name: string; code: string | null; annual_quota: number; is_paid: boolean }[];
}

export interface CashSummary {
  date: string;
  close: { id: number; status: string; amount_confirmed: number } | null;
  opening_balance: number;
  cash: number;
  cheque: number;
  digital: number;
  credit: number;
  expenses?: number;
  expected_in_hand: number;
  pending_dates: string[];
  expense_claims?: { id: number; claim_date: string; amount: number; status: string; category: string | null; call_id: string | null; description: string | null }[];
  payments: { id: number; receipt_number: string | null; method: string; amount: number; paid_at: string; call_id: string | null; customer: string | null }[];
}

export type DayStatus = 'present' | 'half_day' | 'absent' | 'leave' | 'unpaid_leave' | 'holiday' | 'weekly_off' | 'not_joined' | 'future';

export interface AttendanceDay {
  date: string;
  status: DayStatus;
  code: string;
  in: string | null;
  out: string | null;
  minutes: number;
  leave_type?: string | null;
  holiday?: string | null;
}

export interface LeaveBalance {
  leave_type: { id: number; name: string; code: string | null; is_paid: boolean };
  quota: number;
  used: number;
  pending: number;
  remaining: number | null;
}

export interface LeaveRequest {
  id: number;
  from_date: string;
  to_date: string;
  half_day: boolean;
  days: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decision_note: string | null;
  type?: Named | null;
}

export interface Payslip {
  id: number;
  present_days: number;
  lop_days: number;
  net_pay: number;
  run?: { month: string; status: string };
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string | null;
  message: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}
