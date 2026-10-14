<?php

namespace App\Services\People;

use App\Models\BenefitProgram;
use App\Models\Employee;

/**
 * Calculates statutory and company benefit contributions according to Republic Acts,
 * DOLE guidelines, SSS MSC tables, PhilHealth and Pag-IBIG circulars.
 */
class BenefitCalculator
{
    /**
     * Compute employee and employer shares for a program and employee basic pay.
     *
     * @return array{employee_share: float, employer_share: float, total: float}
     */
    public function computeShares(BenefitProgram $program, float $monthlyBasicPay): array
    {
        return match ($program->contribution_basis) {
            'statutory_sss' => $this->computeSss($monthlyBasicPay),
            'statutory_philhealth' => $this->computePhilHealth($monthlyBasicPay),
            'statutory_pagibig' => $this->computePagIbig($monthlyBasicPay),
            'percent_of_basic' => $this->computePercentage($program, $monthlyBasicPay),
            default => [
                'employee_share' => (float) $program->default_employee_share,
                'employer_share' => (float) $program->default_employer_share,
                'total' => (float) ($program->default_employee_share + $program->default_employer_share),
            ],
        };
    }

    /**
     * SSS 2025 Schedule (RA 11199): 15% (EE 5%, ER 10% + EC).
     * Monthly Salary Credit (MSC) clamped between 5,000 and 35,000 in 500 brackets.
     */
    public function computeSss(float $basicPay): array
    {
        $cfg = config('people.statutory.sss', [
            'rate_employee' => 0.05,
            'rate_employer' => 0.10,
            'msc_min' => 5000,
            'msc_max' => 35000,
            'msc_step' => 500,
            'ec_low' => 10,
            'ec_high' => 30,
            'ec_threshold' => 15000,
        ]);

        $msc = max($cfg['msc_min'], min($cfg['msc_max'], round($basicPay / $cfg['msc_step']) * $cfg['msc_step']));

        $ee = round($msc * $cfg['rate_employee'], 2);
        $erBase = round($msc * $cfg['rate_employer'], 2);
        $ec = $msc < $cfg['ec_threshold'] ? $cfg['ec_low'] : $cfg['ec_high'];
        $er = round($erBase + $ec, 2);

        return [
            'employee_share' => $ee,
            'employer_share' => $er,
            'total' => round($ee + $er, 2),
            'msc' => $msc,
            'ec' => $ec,
        ];
    }

    /**
     * PhilHealth (Universal Health Care Act): 5% premium, shared equally 50-50.
     * Floor: 10,000 / Ceiling: 100,000.
     */
    public function computePhilHealth(float $basicPay): array
    {
        $cfg = config('people.statutory.philhealth', [
            'rate' => 0.05,
            'floor' => 10000,
            'ceiling' => 100000,
        ]);

        $base = max($cfg['floor'], min($cfg['ceiling'], $basicPay));
        $totalPremium = round($base * $cfg['rate'], 2);
        $ee = round($totalPremium / 2, 2);
        $er = round($totalPremium - $ee, 2);

        return [
            'employee_share' => $ee,
            'employer_share' => $er,
            'total' => $totalPremium,
        ];
    }

    /**
     * Pag-IBIG / HDMF (Circular 460):
     * EE: 1% if basic <= 1,500 else 2%; ER: 2%.
     * Maximum fund compensation: 10,000 (Maximum EE 200, ER 200).
     */
    public function computePagIbig(float $basicPay): array
    {
        $cfg = config('people.statutory.pagibig', [
            'rate_employee' => 0.02,
            'rate_employee_low' => 0.01,
            'low_threshold' => 1500,
            'rate_employer' => 0.02,
            'max_fund_salary' => 10000,
        ]);

        $base = min($cfg['max_fund_salary'], $basicPay);
        $eeRate = $basicPay <= $cfg['low_threshold'] ? $cfg['rate_employee_low'] : $cfg['rate_employee'];
        $ee = round($base * $eeRate, 2);
        $er = round($base * $cfg['rate_employer'], 2);

        return [
            'employee_share' => $ee,
            'employer_share' => $er,
            'total' => round($ee + $er, 2),
        ];
    }

    public function computePercentage(BenefitProgram $program, float $basicPay): array
    {
        $ee = round($basicPay * ((float) $program->employee_rate / 100), 2);
        $er = round($basicPay * ((float) $program->employer_rate / 100), 2);

        return [
            'employee_share' => $ee,
            'employer_share' => $er,
            'total' => round($ee + $er, 2),
        ];
    }
}

