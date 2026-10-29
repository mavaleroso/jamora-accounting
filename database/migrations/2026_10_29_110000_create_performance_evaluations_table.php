<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Periodic performance reviews (Employee Handbook, Performance Evaluations): the supervisor rates the employee against
 * the period's standards, notes strengths, problems to resolve and growth goals, then shares the review; the employee
 * acknowledges it with their own comments. Admin and Accountant hold evaluations.manage (RoleEnum::defaultPermissions).
 */
return new class extends Migration
{
    private const PERMISSION = 'evaluations.manage';

    public function up(): void
    {
        Schema::create('performance_evaluations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entity_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('evaluator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('review_type'); // probationary, periodic, special
            $table->date('period_start');
            $table->date('period_end');
            $table->date('review_date');
            $table->json('ratings')->nullable(); // criterion key => 1..5
            $table->decimal('overall_rating', 3, 2)->nullable();
            $table->text('standards')->nullable();
            $table->text('strengths')->nullable();
            $table->text('improvements')->nullable();
            $table->text('goals')->nullable();
            $table->string('status')->default('draft'); // draft, shared, acknowledged
            $table->timestamp('shared_at')->nullable();
            $table->text('employee_comments')->nullable();
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamps();

            $table->index(['entity_id', 'employee_id']);
            $table->index(['entity_id', 'status']);
        });

        app(PermissionRegistrar::class)->forgetCachedPermissions();
        Permission::findOrCreate(self::PERMISSION, 'web');
        foreach (['Admin', 'Accountant'] as $role) {
            Role::query()->where('name', $role)->where('guard_name', 'web')->first()?->givePermissionTo(self::PERMISSION);
        }
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Schema::dropIfExists('performance_evaluations');
        Permission::query()->where('name', self::PERMISSION)->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
