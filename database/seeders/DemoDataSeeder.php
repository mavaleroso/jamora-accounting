<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\BankAccount;
use App\Models\BankTransaction;
use App\Models\BenefitProgram;
use App\Models\Bill;
use App\Models\BillLine;
use App\Models\ComplianceItem;
use App\Models\CustomerDeposit;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\EmployeeBenefit;
use App\Models\Entity;
use App\Models\FiscalYear;
use App\Models\InventoryItem;
use App\Models\InventoryMovement;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoicePayment;
use App\Models\Journal;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\LeaveRequest;
use App\Models\Partner;
use App\Models\PayrollPeriod;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Models\ShiftRoster;
use App\Models\User;
use App\Models\Vendor;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $entities = Entity::all()->keyBy('id');
        if ($entities->isEmpty()) {
            return;
        }

        $admin = User::first();
        $adminId = $admin?->id;

        $employeeUser = User::where('username', 'employee')->first();

        $jamOpticus = $entities[1] ?? $entities->first();
        $aJamora = $entities[2] ?? $entities->first();
        $alJamora = $entities[3] ?? $entities->first();

        if ($employeeUser) {
            $employeeUser->entities()->syncWithoutDetaching([$jamOpticus->id, $aJamora->id, $alJamora->id]);
        }

        $bankAccounts = BankAccount::all()->keyBy('id');
        $bdoShared = $bankAccounts[1] ?? $bankAccounts->first();
        $bpiShared = $bankAccounts[2] ?? $bankAccounts->first();
        $bdoAlJamora = $bankAccounts[5] ?? $bankAccounts->first();

        // 1. Partners (Customers / Patients)
        $cust1 = Partner::firstOrCreate(
            ['entity_id' => $jamOpticus->id, 'code' => 'CUST-001'],
            [
                'name' => 'Gretchen Escala',
                'type' => 'customer',
                'tin' => '123-456-789-000',
                'email' => 'gretchen@escala.ph',
                'phone' => '09171234567',
                'address' => 'Iloilo City',
                'is_active' => true,
            ]
        );

        $cust2 = Partner::firstOrCreate(
            ['entity_id' => $aJamora->id, 'code' => 'PAT-002'],
            [
                'name' => 'Maria Clara Mercado',
                'type' => 'patient',
                'tin' => null,
                'email' => 'clarita@gmail.com',
                'phone' => '09189876543',
                'address' => 'Jaro, Iloilo City',
                'is_active' => true,
            ]
        );

        $cust3 = Partner::firstOrCreate(
            ['entity_id' => $alJamora->id, 'code' => 'PED-003'],
            [
                'name' => 'Liam Alexander Tan (Child)',
                'type' => 'patient',
                'tin' => null,
                'email' => 'tanfamily@yahoo.com',
                'phone' => '09205551234',
                'address' => 'Mandurriao, Iloilo City',
                'is_active' => true,
            ]
        );

        // 2. Vendors (Optical Suppliers)
        $vend1 = Vendor::firstOrCreate(
            ['entity_id' => $jamOpticus->id, 'code' => 'VEND-001'],
            [
                'name' => 'Essilor Optical Laboratories Phils.',
                'tin' => '000-888-999-000',
                'email' => 'orders@essilor.com.ph',
                'phone' => '(02) 8888-1234',
                'address' => 'Pasig City, Metro Manila',
                'is_active' => true,
            ]
        );

        $vend2 = Vendor::firstOrCreate(
            ['entity_id' => $jamOpticus->id, 'code' => 'VEND-002'],
            [
                'name' => 'Luxottica Southeast Asia Ltd.',
                'tin' => '001-222-333-000',
                'email' => 'distributors@luxottica.com',
                'phone' => '(02) 8777-5678',
                'address' => 'Bonifacio Global City, Taguig',
                'is_active' => true,
            ]
        );

        // 3. Central Employee Database
        $emp1 = Employee::updateOrCreate(
            ['entity_id' => $jamOpticus->id, 'employee_code' => 'EMP-001'],
            [
                'firstname' => 'Maria',
                'middlename' => 'Santos',
                'lastname' => 'Dizon, OD',
                'position' => 'Senior Optometrist',
                'department' => 'Clinical Services',
                'biometric_id' => 'BIO-001',
                'email' => 'dr.maria@jamora.ph',
                'phone' => '09171110001',
                'hire_date' => '2023-03-01',
                'employment_status' => 'regular',
                'pay_type' => 'monthly',
                'basic_pay' => 38000.00,
                'sss_number' => '34-5678901-2',
                'philhealth_number' => '12-009876543-1',
                'pagibig_number' => '1210-9876-5432',
                'tin' => '234-567-890-000',
                'bank_name' => 'BDO Unibank',
                'bank_account_no' => '001234567890',
                'leave_credits' => 15.00,
                'vacation_leave_credits' => 10.00,
                'sick_leave_credits' => 10.00,
                'is_active' => true,
            ]
        );

        $emp2 = Employee::updateOrCreate(
            ['entity_id' => $jamOpticus->id, 'employee_code' => 'EMP-002'],
            [
                'firstname' => 'Juan',
                'middlename' => 'Carlos',
                'lastname' => 'Dela Cruz',
                'position' => 'Lead Lab & Edging Technician',
                'department' => 'Optical Laboratory',
                'biometric_id' => 'BIO-002',
                'email' => 'juan.lab@jamora.ph',
                'phone' => '09172220002',
                'hire_date' => '2023-06-15',
                'employment_status' => 'regular',
                'pay_type' => 'monthly',
                'basic_pay' => 24500.00,
                'sss_number' => '34-5678902-3',
                'philhealth_number' => '12-009876544-2',
                'pagibig_number' => '1210-9876-5433',
                'tin' => '234-567-891-000',
                'bank_name' => 'BDO Unibank',
                'bank_account_no' => '001234567891',
                'leave_credits' => 12.00,
                'vacation_leave_credits' => 8.00,
                'sick_leave_credits' => 10.00,
                'is_active' => true,
            ]
        );

        $emp3 = Employee::updateOrCreate(
            ['entity_id' => $aJamora->id, 'employee_code' => 'EMP-003'],
            [
                'firstname' => 'Anna',
                'middlename' => 'Mae',
                'lastname' => 'Reyes',
                'position' => 'Front Desk & Billing Cashier',
                'department' => 'Administration',
                'biometric_id' => 'BIO-003',
                'email' => 'anna.billing@jamora.ph',
                'phone' => '09173330003',
                'hire_date' => '2024-01-10',
                'employment_status' => 'regular',
                'pay_type' => 'monthly',
                'basic_pay' => 20000.00,
                'sss_number' => '34-5678903-4',
                'philhealth_number' => '12-009876545-3',
                'pagibig_number' => '1210-9876-5434',
                'tin' => '234-567-892-000',
                'bank_name' => 'BPI',
                'bank_account_no' => '098765432101',
                'leave_credits' => 10.00,
                'vacation_leave_credits' => 7.00,
                'sick_leave_credits' => 10.00,
                'is_active' => true,
            ]
        );

        $emp4 = Employee::updateOrCreate(
            ['entity_id' => $alJamora->id, 'employee_code' => 'EMP-004'],
            [
                'firstname' => 'Mark',
                'middlename' => 'Anthony',
                'lastname' => 'Bautista, OD',
                'position' => 'Pediatric Optometry Specialist',
                'department' => 'Pediatric Clinic',
                'biometric_id' => 'BIO-004',
                'email' => 'dr.mark@aljamora.ph',
                'phone' => '09174440004',
                'hire_date' => '2024-05-01',
                'employment_status' => 'regular',
                'pay_type' => 'monthly',
                'basic_pay' => 40000.00,
                'sss_number' => '34-5678904-5',
                'philhealth_number' => '12-009876546-4',
                'pagibig_number' => '1210-9876-5435',
                'tin' => '234-567-893-000',
                'bank_name' => 'BDO Unibank',
                'bank_account_no' => '005556677889',
                'leave_credits' => 10.00,
                'vacation_leave_credits' => 8.00,
                'sick_leave_credits' => 10.00,
                'is_active' => true,
            ]
        );

        $emp5 = Employee::updateOrCreate(
            ['entity_id' => $jamOpticus->id, 'employee_code' => 'EMP-005'],
            [
                'user_id' => $employeeUser?->id,
                'firstname' => 'Elena',
                'middlename' => 'Rose',
                'lastname' => 'Gomez',
                'position' => 'Optical Sales & Dispenser',
                'department' => 'Retail Floor',
                'biometric_id' => 'BIO-005',
                'email' => 'elena.sales@jamora.ph',
                'phone' => '09175550005',
                'hire_date' => '2024-09-01',
                'employment_status' => 'probationary',
                'pay_type' => 'monthly',
                'basic_pay' => 19500.00,
                'sss_number' => '34-5678905-6',
                'philhealth_number' => '12-009876547-5',
                'pagibig_number' => '1210-9876-5436',
                'tin' => '234-567-894-000',
                'bank_name' => 'BDO Unibank',
                'bank_account_no' => '001234567895',
                'leave_credits' => 5.00,
                'vacation_leave_credits' => 5.00,
                'sick_leave_credits' => 5.00,
                'is_active' => true,
            ]
        );

        // 4. Shift Rosters (Capability 2 - Weekly Roster Grid)
        $currentMonday = Carbon::now()->startOfWeek();
        $employees = [$emp1, $emp2, $emp3, $emp4, $emp5];

        foreach ($employees as $idx => $emp) {
            for ($d = 0; $d < 7; $d++) {
                $rosterDate = (clone $currentMonday)->addDays($d);
                $isRest = ($d === 5 || $d === 6); // Sat & Sun rest day for most, or adjusted
                if ($emp->employee_code === 'EMP-002') {
                    $isRest = ($d === 6); // Technician works Sat, off Sun
                }
                if ($emp->employee_code === 'EMP-004') {
                    $isRest = ($d === 0 || $d === 6); // Pediatric works Tue-Sat
                }

                ShiftRoster::updateOrCreate(
                    [
                        'employee_id' => $emp->id,
                        'roster_date' => $rosterDate->toDateString(),
                    ],
                    [
                        'entity_id' => $emp->entity_id,
                        'shift_name' => $isRest ? 'Rest Day' : 'Morning Shift (8:00 AM - 5:00 PM)',
                        'shift_start' => $isRest ? null : '08:00:00',
                        'shift_end' => $isRest ? null : '17:00:00',
                        'is_rest_day' => $isRest,
                        'status' => 'published',
                        'notes' => $isRest ? 'Scheduled weekly rest day' : 'Standard clinical/lab duty',
                    ]
                );

                // Capability 3 - Time & Attendance DTR Punch records for past days
                if ($rosterDate->isPast() && ! $isRest) {
                    $tardyMinutes = ($idx === 1 && $d === 1) ? 25 : 0; // Simulated tardiness for technician
                    DtrEntry::updateOrCreate(
                        [
                            'employee_id' => $emp->id,
                            'work_date' => $rosterDate->toDateString(),
                        ],
                        [
                            'entity_id' => $emp->entity_id,
                            'time_in' => $tardyMinutes > 0 ? '08:25:00' : '07:55:00',
                            'time_out' => '17:05:00',
                            'regular_hours' => 8.00,
                            'ot_hours' => ($idx === 0 && $d === 2) ? 1.50 : 0.00, // Optometrist 1.5 hr OT
                            'tardiness_minutes' => $tardyMinutes,
                            'is_absent' => false,
                            'source' => 'biometric',
                            'notes' => $tardyMinutes > 0 ? 'Heavy rain traffic in Diversion Road' : 'Normal biometric punch',
                        ]
                    );
                }
            }
        }

        // 5. Leave & Absence Requests (Capability 4)
        LeaveRequest::updateOrCreate(
            ['employee_id' => $emp1->id, 'start_date' => Carbon::now()->addDays(5)->toDateString()],
            [
                'entity_id' => $emp1->entity_id,
                'leave_type' => 'vacation',
                'end_date' => Carbon::now()->addDays(6)->toDateString(),
                'days_count' => 2.0,
                'reason' => 'Annual family vacation leave approved in advance',
                'status' => 'approved',
                'approved_by' => $adminId,
                'approved_at' => now()->subDay(),
            ]
        );

        LeaveRequest::updateOrCreate(
            ['employee_id' => $emp5->id, 'start_date' => Carbon::now()->subDays(2)->toDateString()],
            [
                'entity_id' => $emp5->entity_id,
                'leave_type' => 'sick',
                'end_date' => Carbon::now()->subDays(2)->toDateString(),
                'days_count' => 1.0,
                'reason' => 'Flu and fever with medical certificate attached',
                'status' => 'approved',
                'approved_by' => $adminId,
                'approved_at' => now()->subDays(2),
            ]
        );

        LeaveRequest::updateOrCreate(
            ['employee_id' => $emp2->id, 'start_date' => Carbon::now()->addDays(10)->toDateString()],
            [
                'entity_id' => $emp2->entity_id,
                'leave_type' => 'emergency',
                'end_date' => Carbon::now()->addDays(10)->toDateString(),
                'days_count' => 1.0,
                'reason' => 'Personal home repair emergency',
                'status' => 'pending',
            ]
        );

        // 6. Benefits Administration (Capability 6)
        $progSss = BenefitProgram::firstOrCreate(
            ['code' => 'SSS'],
            [
                'name' => 'Social Security System (SSS)',
                'category' => 'statutory',
                'payroll_mode' => 'statutory',
                'description' => 'Mandatory Philippine social insurance scheme',
                'default_employee_share' => 1350.00,
                'default_employer_share' => 2850.00,
                'is_taxable' => false,
                'is_active' => true,
            ]
        );

        $progPh = BenefitProgram::firstOrCreate(
            ['code' => 'PHILHEALTH'],
            [
                'name' => 'Philippine Health Insurance (PhilHealth)',
                'category' => 'statutory',
                'payroll_mode' => 'statutory',
                'description' => 'Mandatory national health insurance',
                'default_employee_share' => 750.00,
                'default_employer_share' => 750.00,
                'is_taxable' => false,
                'is_active' => true,
            ]
        );

        $progPagibig = BenefitProgram::firstOrCreate(
            ['code' => 'PAGIBIG'],
            [
                'name' => 'Home Development Mutual Fund (Pag-IBIG)',
                'category' => 'statutory',
                'payroll_mode' => 'statutory',
                'description' => 'Mandatory provident & housing mutual fund',
                'default_employee_share' => 200.00,
                'default_employer_share' => 200.00,
                'is_taxable' => false,
                'is_active' => true,
            ]
        );

        $progMeal = BenefitProgram::firstOrCreate(
            ['code' => 'MEAL_ALLOWANCE'],
            [
                'name' => 'Monthly Clinic Meal Allowance',
                'category' => 'allowance',
                'payroll_mode' => 'earning',
                'description' => 'De minimis non-taxable clinic meal support',
                'default_employee_share' => 0.00,
                'default_employer_share' => 1500.00,
                'is_taxable' => false,
                'is_active' => true,
            ]
        );

        $progEyewear = BenefitProgram::firstOrCreate(
            ['code' => 'EYEWEAR_BENEFIT'],
            [
                'name' => 'Annual Staff Optical & Lens Subsidy',
                'category' => 'company',
                'payroll_mode' => 'none', // annual grant, claimed separately
                'description' => 'Company-provided prescription eyewear grant',
                'default_employee_share' => 0.00,
                'default_employer_share' => 3000.00,
                'is_taxable' => false,
                'is_active' => true,
            ]
        );

        foreach ($employees as $emp) {
            EmployeeBenefit::updateOrCreate(
                ['employee_id' => $emp->id, 'benefit_program_id' => $progSss->id],
                [
                    'participation_status' => 'active',
                    'employee_share' => $emp->basic_pay > 30000 ? 1350.00 : 950.00,
                    'employer_share' => $emp->basic_pay > 30000 ? 2850.00 : 1900.00,
                    'payroll_treatment' => 'standard',
                    'effective_date' => '2024-01-01',
                ]
            );

            EmployeeBenefit::updateOrCreate(
                ['employee_id' => $emp->id, 'benefit_program_id' => $progPh->id],
                [
                    'participation_status' => 'active',
                    'employee_share' => round($emp->basic_pay * 0.025, 2),
                    'employer_share' => round($emp->basic_pay * 0.025, 2),
                    'payroll_treatment' => 'standard',
                    'effective_date' => '2024-01-01',
                ]
            );

            EmployeeBenefit::updateOrCreate(
                ['employee_id' => $emp->id, 'benefit_program_id' => $progPagibig->id],
                [
                    'participation_status' => 'active',
                    'employee_share' => 200.00,
                    'employer_share' => 200.00,
                    'payroll_treatment' => 'standard',
                    'effective_date' => '2024-01-01',
                ]
            );

            EmployeeBenefit::updateOrCreate(
                ['employee_id' => $emp->id, 'benefit_program_id' => $progMeal->id],
                [
                    'participation_status' => 'active',
                    'employee_share' => 0.00,
                    'employer_share' => 1500.00,
                    'payroll_treatment' => 'allowance',
                    'effective_date' => '2024-01-01',
                ]
            );
        }

        // 7. Compliance Management (Capability 10)
        ComplianceItem::updateOrCreate(
            ['entity_id' => $jamOpticus->id, 'title' => 'BIR Form 1601-C (Withholding Tax - Compensation)'],
            [
                'category' => 'statutory_tax',
                'period' => 'September 2026',
                'due_date' => '2026-10-10',
                'owner_role' => 'Finance & Accounting',
                'status' => 'submitted',
                'reference_no' => 'BIR-1601C-2026-09-001',
                'amount' => 18450.00,
                'notes' => 'Filed via eFPS on 2026-10-08',
                'verified_by' => $adminId,
                'verified_at' => now(),
            ]
        );

        ComplianceItem::updateOrCreate(
            ['entity_id' => $jamOpticus->id, 'title' => 'SSS R-3 Contribution Collection List'],
            [
                'category' => 'statutory_payroll',
                'period' => 'September 2026',
                'due_date' => '2026-10-31',
                'owner_role' => 'HR / Payroll',
                'status' => 'prepared',
                'reference_no' => 'SSS-R3-SEP2026',
                'amount' => 22400.00,
                'notes' => 'Generated from final payroll run',
            ]
        );

        ComplianceItem::updateOrCreate(
            ['entity_id' => $aJamora->id, 'title' => 'PhilHealth EPRS Monthly Remittance'],
            [
                'category' => 'statutory_payroll',
                'period' => 'September 2026',
                'due_date' => '2026-10-20',
                'owner_role' => 'HR / Accounting',
                'status' => 'verified',
                'reference_no' => 'PHIC-EPRS-0926-88',
                'amount' => 6500.00,
                'notes' => 'Settled via online bank debit',
                'verified_by' => $adminId,
                'verified_at' => now(),
            ]
        );

        ComplianceItem::updateOrCreate(
            ['entity_id' => $alJamora->id, 'title' => 'Pag-IBIG MCR Contribution Remittance'],
            [
                'category' => 'statutory_payroll',
                'period' => 'September 2026',
                'due_date' => '2026-10-15',
                'owner_role' => 'HR / Accounting',
                'status' => 'verified',
                'reference_no' => 'HDMF-MCR-202609-AL',
                'amount' => 2400.00,
                'notes' => 'Paid from Dedicated AL Jamora BDO Account',
                'verified_by' => $adminId,
                'verified_at' => now(),
            ]
        );

        ComplianceItem::updateOrCreate(
            ['entity_id' => $jamOpticus->id, 'title' => 'Quarterly VAT Return (BIR Form 2550Q - Q3)'],
            [
                'category' => 'statutory_tax',
                'period' => 'Q3 2026',
                'due_date' => '2026-10-25',
                'owner_role' => 'CPA Consultant / Accounting',
                'status' => 'pending',
                'reference_no' => null,
                'amount' => 48200.00,
                'notes' => 'Under CPA Gretchen Escala audit review',
            ]
        );

        // 8. Inventory System Items & Movements (Module 3)
        $invAccount = Account::where('code', '1200')->first();
        $inv1 = InventoryItem::updateOrCreate(
            ['entity_id' => $jamOpticus->id, 'sku' => 'FRM-RB-AVIATOR'],
            [
                'name' => 'Ray-Ban Aviator Classic (Gold/Green G-15)',
                'category' => 'frame',
                'brand' => 'Ray-Ban',
                'unit_cost' => 4500.00,
                'selling_price' => 7800.00,
                'qty_on_hand' => 14,
                'reorder_level' => 5,
                'gl_account_id' => $invAccount?->id,
                'is_active' => true,
            ]
        );

        $inv2 = InventoryItem::updateOrCreate(
            ['entity_id' => $jamOpticus->id, 'sku' => 'LNS-ESS-PROG167'],
            [
                'name' => 'Essilor Varilux Comfort Max 1.67 Crizal Prevencia',
                'category' => 'lens',
                'brand' => 'Essilor',
                'unit_cost' => 2800.00,
                'selling_price' => 5500.00,
                'qty_on_hand' => 4, // Below reorder level!
                'reorder_level' => 8,
                'gl_account_id' => $invAccount?->id,
                'is_active' => true,
            ]
        );

        $inv3 = InventoryItem::updateOrCreate(
            ['entity_id' => $jamOpticus->id, 'sku' => 'LNS-SGL-156-BLUE'],
            [
                'name' => 'Single Vision 1.56 Blue-Cut UV420 Hard Multi-Coated',
                'category' => 'lens',
                'brand' => 'Jamora Optics Lab',
                'unit_cost' => 650.00,
                'selling_price' => 1800.00,
                'qty_on_hand' => 45,
                'reorder_level' => 15,
                'gl_account_id' => $invAccount?->id,
                'is_active' => true,
            ]
        );

        $inv4 = InventoryItem::updateOrCreate(
            ['entity_id' => $aJamora->id, 'sku' => 'SOL-OPTI-PURE355'],
            [
                'name' => 'Opti-Free PureMoist Multi-Purpose Solution 355ml',
                'category' => 'solution',
                'brand' => 'Alcon',
                'unit_cost' => 320.00,
                'selling_price' => 520.00,
                'qty_on_hand' => 2, // Low stock alert!
                'reorder_level' => 10,
                'gl_account_id' => $invAccount?->id,
                'is_active' => true,
            ]
        );

        // Movements
        InventoryMovement::updateOrCreate(
            ['entity_id' => $jamOpticus->id, 'movement_reference' => 'GRN-2026-09-001'],
            [
                'inventory_item_id' => $inv2->id,
                'movement_type' => 'supplier_receipt',
                'quantity' => 10,
                'unit_cost' => 2800.00,
                'total_cost' => 28000.00,
                'accounting_link_type' => 'ap_receipt',
                'review_status' => 'matched',
                'notes' => 'Received from Essilor under PO-9921 / Luxottica batch',
            ]
        );

        InventoryMovement::updateOrCreate(
            ['entity_id' => $jamOpticus->id, 'movement_reference' => 'ISS-2026-09-044'],
            [
                'inventory_item_id' => $inv1->id,
                'movement_type' => 'sales_issue',
                'quantity' => 1,
                'unit_cost' => 4500.00,
                'total_cost' => 4500.00,
                'accounting_link_type' => 'cogs',
                'review_status' => 'matched',
                'notes' => 'Issued to Optical Job Order JO-1092',
            ]
        );

        InventoryMovement::updateOrCreate(
            ['entity_id' => $jamOpticus->id, 'movement_reference' => 'LAB-LOSS-09-012'],
            [
                'inventory_item_id' => $inv3->id,
                'movement_type' => 'edging_loss',
                'quantity' => 2,
                'unit_cost' => 650.00,
                'total_cost' => 1300.00,
                'accounting_link_type' => 'inventory_loss',
                'review_status' => 'needs_review',
                'notes' => 'Bevel edging calibration fracture on rimless groove trial. Pending lab supervisor sign-off.',
            ]
        );

        // 9. Customer Deposits (Module 2, Slide 35)
        $dep1 = CustomerDeposit::updateOrCreate(
            ['entity_id' => $jamOpticus->id, 'reference' => 'DEP-2026-001'],
            [
                'partner_id' => $cust1->id,
                'deposit_date' => Carbon::now()->subDays(5)->toDateString(),
                'amount' => 5000.00,
                'applied_amount' => 3000.00,
                'status' => 'open',
                'payment_method' => 'gcash',
                'notes' => 'Advance downpayment for customized high-index Varilux progressive lenses package.',
            ]
        );

        $dep2 = CustomerDeposit::updateOrCreate(
            ['entity_id' => $alJamora->id, 'reference' => 'DEP-2026-002'],
            [
                'partner_id' => $cust3->id,
                'deposit_date' => Carbon::now()->subDays(2)->toDateString(),
                'amount' => 2500.00,
                'applied_amount' => 0.00,
                'status' => 'open',
                'payment_method' => 'card',
                'notes' => 'Reservation deposit for pediatric orthokeratology trial kit.',
            ]
        );

        // 10. Invoices with Edging / Repair / Package Line Items (Slide 34-36)
        $invObj = Invoice::updateOrCreate(
            ['entity_id' => $jamOpticus->id, 'invoice_no' => 'INV-2026-001'],
            [
                'partner_id' => $cust1->id,
                'bir_si_or_no' => 'BIR-SI-2026-8801',
                'invoice_date' => Carbon::now()->subDays(2)->toDateString(),
                'due_date' => Carbon::now()->addDays(28)->toDateString(),
                'pricing_type' => 'retail',
                'status' => 'partially_paid',
                'is_senior_pwd' => false,
                'is_vat_exempt' => false,
                'subtotal' => 13300.00,
                'discount_amount' => 500.00,
                'vat_amount' => 1536.00,
                'total_amount' => 14336.00,
                'amount_paid' => 3000.00,
                'balance_due' => 11336.00,
                'notes' => 'Progressive lens package + frame + custom lab bevel edging',
                'created_by' => $adminId,
            ]
        );

        InvoiceLine::updateOrCreate(
            ['invoice_id' => $invObj->id, 'line_no' => 1],
            [
                'line_type' => 'product',
                'description' => 'Ray-Ban Aviator Classic Frame (FRM-RB-AVIATOR)',
                'quantity' => 1,
                'unit_price' => 7800.00,
                'discount_amount' => 500.00,
                'amount' => 7300.00,
            ]
        );

        InvoiceLine::updateOrCreate(
            ['invoice_id' => $invObj->id, 'line_no' => 2],
            [
                'line_type' => 'product',
                'description' => 'Varilux Comfort Max 1.67 Lenses Pair (LNS-ESS-PROG167)',
                'quantity' => 1,
                'unit_price' => 5500.00,
                'discount_amount' => 0.00,
                'amount' => 5500.00,
            ]
        );

        InvoiceLine::updateOrCreate(
            ['invoice_id' => $invObj->id, 'line_no' => 3],
            [
                'line_type' => 'edging',
                'description' => 'Precision Bevel Lab Edging & Fitting Service',
                'quantity' => 1,
                'unit_price' => 500.00,
                'discount_amount' => 0.00,
                'amount' => 500.00,
            ]
        );

        // 11. Supplier Bills & Accounts Payable (Module 4, Slide 39-42)
        $bill1 = Bill::updateOrCreate(
            ['entity_id' => $jamOpticus->id, 'bill_no' => 'BILL-2026-001'],
            [
                'vendor_id' => $vend1->id,
                'vendor_invoice_no' => 'ESSILOR-INV-9921',
                'bill_date' => Carbon::now()->subDays(10)->toDateString(),
                'due_date' => Carbon::now()->addDays(20)->toDateString(),
                'status' => 'posted',
                'subtotal' => 28000.00,
                'vat_amount' => 3360.00,
                'total_amount' => 31360.00,
                'amount_paid' => 0.00,
                'balance_due' => 31360.00,
                'notes' => 'Batch stock of 10 pairs Varilux progressive lenses',
                'created_by' => $adminId,
            ]
        );

        BillLine::updateOrCreate(
            ['bill_id' => $bill1->id, 'line_no' => 1],
            [
                'description' => 'Varilux Progressive Lenses stock delivery',
                'account_id' => $invAccount?->id,
                'amount' => 28000.00,
            ]
        );

        // 12. Cash / Bank Transactions Register (Module 1 & 4, Slide 15-16, Slide 43-45)
        // Record inflows and outflows across the 5 accounts
        BankTransaction::updateOrCreate(
            ['bank_account_id' => $bdoShared->id, 'reference' => 'TXN-BDO-001'],
            [
                'entity_id' => $jamOpticus->id,
                'txn_date' => Carbon::now()->subDays(5)->toDateString(),
                'description' => 'Customer Deposit received via GCash clearing - Gretchen Escala',
                'amount' => 5000.00,
                'direction' => 'in',
                'source_type' => 'customer_deposit',
                'source_id' => $dep1->id,
                'is_cleared' => true,
                'cleared_at' => now()->subDays(4),
            ]
        );

        BankTransaction::updateOrCreate(
            ['bank_account_id' => $bdoShared->id, 'reference' => 'TXN-BDO-002'],
            [
                'entity_id' => $jamOpticus->id,
                'txn_date' => Carbon::now()->subDays(2)->toDateString(),
                'description' => 'Invoice Collection partial payment - INV-2026-001',
                'amount' => 3000.00,
                'direction' => 'in',
                'source_type' => 'invoice_payment',
                'source_id' => $invObj->id,
                'is_cleared' => true,
                'cleared_at' => now()->subDays(1),
            ]
        );

        BankTransaction::updateOrCreate(
            ['bank_account_id' => $bpiShared->id, 'reference' => 'TXN-BPI-001'],
            [
                'entity_id' => $aJamora->id,
                'txn_date' => Carbon::now()->subDays(3)->toDateString(),
                'description' => 'Patient Clinical Consultation & Frame Sales Batch settlement',
                'amount' => 18500.00,
                'direction' => 'in',
                'source_type' => 'pos_settlement',
                'source_id' => 101,
                'is_cleared' => true,
                'cleared_at' => now()->subDays(2),
            ]
        );

        BankTransaction::updateOrCreate(
            ['bank_account_id' => $bdoAlJamora->id, 'reference' => 'TXN-ALJ-001'],
            [
                'entity_id' => $alJamora->id,
                'txn_date' => Carbon::now()->subDays(2)->toDateString(),
                'description' => 'Pediatric Patient advance deposit - Liam Alexander Tan',
                'amount' => 2500.00,
                'direction' => 'in',
                'source_type' => 'customer_deposit',
                'source_id' => $dep2->id,
                'is_cleared' => true,
                'cleared_at' => now()->subDay(),
            ]
        );

        BankTransaction::updateOrCreate(
            ['bank_account_id' => $bdoShared->id, 'reference' => 'TXN-BDO-EXP-001'],
            [
                'entity_id' => $jamOpticus->id,
                'txn_date' => Carbon::now()->subDays(1)->toDateString(),
                'description' => 'Monthly Clinic Utilities & Meralco Electricity disbursement',
                'amount' => 14200.00,
                'direction' => 'out',
                'source_type' => 'utility_payment',
                'source_id' => 99,
                'is_cleared' => false, // Uncleared for bank reconciliation demo!
            ]
        );
    }
}

