<?php

namespace App\Services\Optical;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

class OpticalApiClient
{
    protected function client(): PendingRequest
    {
        $base = rtrim((string) config('services.optical_api.base_url'), '/');
        $token = (string) config('services.optical_api.token');

        return Http::baseUrl($base)
            ->withToken($token)
            ->acceptJson()
            ->timeout(60);
    }

    public function orders(array $query = []): array
    {
        return $this->client()->get('/api/v1/accounting/orders', $query)->throw()->json();
    }

    public function order(int $id): array
    {
        return $this->client()->get("/api/v1/accounting/orders/{$id}")->throw()->json();
    }

    public function payments(array $query = []): array
    {
        return $this->client()->get('/api/v1/accounting/payments', $query)->throw()->json();
    }

    public function inventoryMovements(array $query = []): array
    {
        return $this->client()->get('/api/v1/accounting/inventory/movements', $query)->throw()->json();
    }

    public function stockSummary(array $query = []): array
    {
        return $this->client()->get('/api/v1/accounting/inventory/stock-summary', $query)->throw()->json();
    }

    public function clients(array $query = []): array
    {
        return $this->client()->get('/api/v1/accounting/clients', $query)->throw()->json();
    }

    public function suppliers(array $query = []): array
    {
        return $this->client()->get('/api/v1/accounting/suppliers', $query)->throw()->json();
    }
}
