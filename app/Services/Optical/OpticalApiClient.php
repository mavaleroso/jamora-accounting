<?php

namespace App\Services\Optical;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;

/**
 * Read-only client for optical-new's accounting API (/api/v1/accounting/*), authenticated with the shared
 * bearer token. Lists are paginated; each() walks every page.
 */
class OpticalApiClient
{
    protected function client(): PendingRequest
    {
        $base = rtrim((string) config('optical.api.base_url'), '/');

        return Http::baseUrl($base.'/api/v1/accounting')
            ->withToken((string) config('optical.api.token'))
            ->acceptJson()
            ->timeout((int) config('optical.api.timeout', 60))
            // Retry dropped connections and server errors; a bad token or request fails at once.
            ->retry(2, 500, fn (\Throwable $e) => $e instanceof ConnectionException
                || ($e instanceof RequestException && $e->response->serverError()), throw: false);
    }

    /**
     * Whether the password is the optical-new user's (users copied from optical-new sign in with it), or null when
     * optical-new can't answer. Quick and without retries, since someone is waiting at the sign-in screen.
     */
    public function checkPassword(int $opticalUserId, string $password): ?bool
    {
        if (! $this->isConfigured()) {
            return null;
        }

        try {
            $response = Http::baseUrl(rtrim((string) config('optical.api.base_url'), '/').'/api/v1/accounting')
                ->withToken((string) config('optical.api.token'))
                ->acceptJson()
                ->timeout(5)
                ->post("users/{$opticalUserId}/check-password", ['password' => $password]);
        } catch (ConnectionException) {
            return null;
        }

        return $response->successful() ? (bool) $response->json('valid') : null;
    }

    public function isConfigured(): bool
    {
        return filled(config('optical.api.base_url')) && filled(config('optical.api.token'));
    }

    /**
     * @return array<string, mixed>
     */
    public function get(string $path, array $query = []): array
    {
        return $this->client()->get(ltrim($path, '/'), array_filter($query, fn ($v) => $v !== null && $v !== ''))->throw()->json() ?? [];
    }

    /**
     * Call $callback for every record of a paginated list, page by page.
     *
     * @param  callable(array<string, mixed>): void  $callback
     */
    public function each(string $path, array $query, callable $callback): int
    {
        $page = 1;
        $count = 0;
        $query['page_size'] = $query['page_size'] ?? (int) config('optical.api.page_size', 100);

        do {
            $response = $this->get($path, [...$query, 'page' => $page]);

            foreach ($response['data'] ?? [] as $record) {
                $callback($record);
                $count++;
            }

            $lastPage = (int) ($response['meta']['last_page'] ?? $page);
            $page++;
        } while ($page <= $lastPage);

        return $count;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function ordersById(array $ids): array
    {
        return $this->get('orders', ['ids' => implode(',', $ids), 'include_open' => 1, 'with_deleted' => 1, 'page_size' => 100])['data'] ?? [];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function paymentsById(array $ids): array
    {
        return $this->get('payments', ['ids' => implode(',', $ids), 'include_open' => 1, 'with_deleted' => 1, 'page_size' => 100])['data'] ?? [];
    }

    /**
     * @return array<string, mixed>
     */
    public function stockSummary(array $query = []): array
    {
        return $this->get('inventory/stock-summary', $query)['data'] ?? [];
    }
}
