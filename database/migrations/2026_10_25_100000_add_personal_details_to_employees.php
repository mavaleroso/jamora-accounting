<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Employee master list fields the directory did not hold yet: date of birth, home address, emergency contact,
 * number of dependents and the name on the payroll bank account.
 *
 * Birth date and address are filled from the employee's login, which already copies them from optical-new. A birth
 * date less than 15 years ago is a placeholder there (no one that young may be employed, RA 9231) and is skipped.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->date('birth_date')->nullable()->after('civil_status');
            $table->string('address')->nullable()->after('phone');
            $table->string('emergency_contact_name')->nullable()->after('address');
            $table->string('emergency_contact_relationship', 50)->nullable()->after('emergency_contact_name');
            $table->string('emergency_contact_phone', 50)->nullable()->after('emergency_contact_relationship');
            $table->unsignedTinyInteger('dependents')->nullable()->after('emergency_contact_phone');
            $table->string('bank_account_name')->nullable()->after('bank_name');
        });

        $latestBirthDate = now()->subYears(15)->toDateString();

        DB::table('employees')
            ->join('users', 'users.id', '=', 'employees.user_id')
            ->select('employees.id', 'users.birthdate', 'users.address')
            ->orderBy('employees.id')
            ->each(function (object $row) use ($latestBirthDate) {
                $birthDate = $row->birthdate ? substr((string) $row->birthdate, 0, 10) : null;
                $address = trim((string) $row->address);

                $values = array_filter([
                    'birth_date' => $birthDate !== null && $birthDate <= $latestBirthDate ? $birthDate : null,
                    'address' => $address !== '' && $address !== '-' ? $address : null,
                ]);

                if ($values !== []) {
                    DB::table('employees')->where('id', $row->id)->update($values);
                }
            });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn(['birth_date', 'address', 'emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_phone', 'dependents', 'bank_account_name']);
        });
    }
};
