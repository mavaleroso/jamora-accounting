<?php

namespace Tests\Support;

use App\Services\Optical\OpticalDatabase;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A throwaway optical POS database for tests: the tables accounting reads from optical-new, with the columns it
 * reads, on an in-memory "optical" connection.
 */
class OpticalPos
{
    /** The POS's cost code letters (the rest are fillers): "UILCQ" is 295, "KY.CY" is 10.50. */
    public const COST_LETTERS = ['K' => 1, 'I' => 2, 'N' => 3, 'G' => 4, 'C' => 5, 'H' => 6, 'A' => 7, 'R' => 8, 'L' => 9, 'Y' => 0, 'U' => null, 'Q' => null];

    /**
     * @param  bool  $withSettings  the columns and table the POS added in Oct 2026 (who bills a service, VAT-exempt
     *                              discounts, a Sales Invoice number per company)
     */
    public static function create(bool $withSettings = true): void
    {
        config(['database.connections.'.OpticalDatabase::CONNECTION => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => false]]);
        DB::purge(OpticalDatabase::CONNECTION);
        $schema = Schema::connection(OpticalDatabase::CONNECTION);

        $schema->create('orders', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('patient_id')->nullable();
            $t->string('ts_no');
            $t->string('walkin_name')->nullable();
            $t->decimal('ordered_amount', 15, 2)->default(0);
            $t->decimal('total_amount', 15, 2)->nullable();
            $t->decimal('total_discounted_amount', 15, 2)->nullable();
            $t->decimal('doctors_discount_amount', 15, 2)->nullable();
            $t->decimal('vat', 15, 2)->nullable();
            $t->string('payment_type')->nullable();
            $t->string('payment_term')->nullable();
            $t->integer('payment_term_count')->nullable();
            $t->dateTime('completed')->nullable();
            $t->dateTime('delivered')->nullable();
            $t->string('or')->nullable();
            $t->string('si')->nullable();
            $t->string('category')->nullable();
            $t->decimal('amount_paid', 15, 2)->nullable();
            $t->string('payment_status')->nullable();
            $t->boolean('is_wholesale_order')->default(false);
            $t->string('wholesale_client_name')->nullable();
            $t->unsignedBigInteger('wholesale_client_id')->nullable();
            $t->string('branch')->default('A.JAMORA');
            $t->softDeletes();
            $t->timestamps();
        });

        $schema->create('order_items', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('order_id');
            $t->string('products_type');
            $t->unsignedBigInteger('products_id');
            $t->unsignedInteger('quantity')->default(1);
            $t->decimal('discount_amount', 15, 2)->nullable();
            $t->decimal('amount', 15, 2)->default(0);
            $t->boolean('is_pre_order')->default(false);
            $t->date('expected_stock_date')->nullable();
            $t->softDeletes();
            $t->timestamps();
        });

        $schema->create('order_payments', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('order_id');
            $t->decimal('amount', 10, 2);
            $t->string('payment_type')->nullable();
            $t->string('payment_method')->nullable();
            $t->string('reference_number')->nullable();
            $t->date('paid_date')->nullable();
            $t->string('status')->default('paid');
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->softDeletes();
        });

        $schema->create('clients', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            foreach (['contact_person', 'phone', 'email', 'address', 'tin', 'terms', 'notes'] as $column) {
                $t->string($column)->nullable();
            }
            $t->string('status')->default('active');
            $t->timestamps();
        });

        $schema->create('suppliers', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            foreach (['code', 'contact_number', 'address', 'email', 'tin'] as $column) {
                $t->string($column)->nullable();
            }
            $t->timestamps();
            $t->softDeletes();
        });

        $schema->create('patients', function (Blueprint $t) {
            $t->id();
            foreach (['firstname', 'middlename', 'lastname', 'extension_name'] as $column) {
                $t->string($column)->nullable();
            }
            $t->timestamps();
        });

        $schema->create('service_fees', function (Blueprint $t) use ($withSettings) {
            $t->id();
            $t->string('name');
            $t->string('type', 20)->default('service');
            if ($withSettings) {
                $t->string('billed_by', 20)->default('branch');
            }
            $t->decimal('amount', 10, 2)->nullable();
            $t->string('item_cost_code')->nullable();
            $t->timestamps();
            $t->softDeletes();
        });

        $schema->create('discounts', function (Blueprint $t) use ($withSettings) {
            $t->id();
            $t->string('code');
            $t->string('name');
            $t->decimal('percentage', 5, 2)->default(0);
            if ($withSettings) {
                $t->boolean('is_vat_exempt')->default(false);
            }
            $t->timestamps();
            $t->softDeletes();
        });

        if ($withSettings) {
            $schema->create('order_sales_invoices', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('order_id');
                $t->string('entity_code', 20);
                $t->string('si_no', 50);
                $t->timestamps();
            });
        }

        $schema->create('cost_code_mappings', function (Blueprint $t) {
            $t->id();
            $t->char('letter', 1);
            $t->decimal('value', 10, 2)->nullable();
            $t->timestamps();
        });

        $schema->create('users', function (Blueprint $t) {
            $t->id();
            foreach (['username', 'firstname', 'middlename', 'lastname', 'avatar', 'address', 'sex', 'contact_number', 'position', 'email'] as $column) {
                $t->string($column)->nullable();
            }
            $t->date('birthdate')->nullable();
            $t->date('date_started')->nullable();
            $t->boolean('status')->default(true);
            $t->string('password');
            $t->timestamps();
        });

        $schema->create('roles', function (Blueprint $t) {
            $t->id();
            $t->string('name');
        });

        $schema->create('model_has_roles', function (Blueprint $t) {
            $t->unsignedBigInteger('role_id');
            $t->string('model_type');
            $t->unsignedBigInteger('model_id');
        });

        foreach (OpticalDatabase::STOCK as $definition) {
            $schema->create($definition['table'], function (Blueprint $t) {
                $t->id();
                foreach (['category', 'brand', 'description', 'item_cost_code', 'delivery_receipt', 'supplier', 'out_branch'] as $column) {
                    $t->string($column)->nullable();
                }
                $t->string('code');
                $t->integer('quantity')->default(1);
                $t->decimal('price', 10, 2)->nullable();
                foreach (['delivery_date', 'is_out', 'is_sold', 'is_defective', 'is_expired', 'is_not_active', 'is_return', 'is_disposable'] as $column) {
                    $t->dateTime($column)->nullable();
                }
                $t->timestamps();
                $t->softDeletes();
            });
        }

        foreach (self::COST_LETTERS as $letter => $value) {
            self::insert('cost_code_mappings', ['letter' => $letter, 'value' => $value]);
        }
    }

    /**
     * Insert a row, stamped now unless the row says when; returns its id.
     *
     * @param  array<string, mixed>  $row
     */
    public static function insert(string $table, array $row): int
    {
        $now = now(config('optical.timezone', 'UTC'))->toDateTimeString();
        $stamps = in_array($table, ['roles', 'model_has_roles'], true) ? [] : ['created_at' => $now, 'updated_at' => $now];

        return (int) DB::connection(OpticalDatabase::CONNECTION)->table($table)->insertGetId([...$stamps, ...$row]);
    }

    /**
     * Change a row as the POS would: its updated_at moves to now.
     *
     * @param  array<string, mixed>  $values
     */
    public static function update(string $table, int $id, array $values): void
    {
        $now = now(config('optical.timezone', 'UTC'))->toDateTimeString();
        DB::connection(OpticalDatabase::CONNECTION)->table($table)->where('id', $id)->update(['updated_at' => $now, ...$values]);
    }
}
