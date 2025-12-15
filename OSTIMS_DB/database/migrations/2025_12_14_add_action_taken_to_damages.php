<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('damages', function (Blueprint $table) {
            $table->string('action_taken')->nullable()->default('write_off')->after('reason');
            // write_off, return_to_supplier
            $table->text('notes')->nullable()->after('action_taken');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('damages', function (Blueprint $table) {
            $table->dropColumn(['action_taken', 'notes']);
        });
    }
};
