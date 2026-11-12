<?php

namespace App\Services\Optical;

use Carbon\CarbonInterface;
use Generator;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Throwable;

/**
 * Reads the optical POS straight from optical-new's database, over the read-only "optical" connection. Nothing is
 * ever written to it.
 *
 * The POS keeps a few things in its code rather than its tables, and they are repeated here:
 *
 *  - what the customer owes on an order (payableTotal): older rows store the total before the doctor's discount;
 *  - an item's cost: stock rows carry a letter code (cost_code_mappings turns each letter into a digit);
 *  - order lines point at their product by the POS's model class name (frames, lens, accessories, solutions or
 *    service fees), and keep pointing at it after the product is deleted;
 *  - orders, order lines, payments, suppliers, service fees, discounts and stock are soft-deleted (deleted_at).
 *
 * Columns the POS added later (who bills a service, VAT-exempt discounts, a Sales Invoice number per company) are
 * read when its database has them and left empty when it does not, so the books fall back to their own rules.
 */
class OpticalDatabase implements OpticalSource
{
    public const CONNECTION = 'optical';

    public const SERVICE_CLASS = 'App\\Models\\ServiceFee';

    /** stock type => its table and the POS model class order lines name it by (in stock-type order). */
    public const STOCK = [
        'accessory' => ['table' => 'accessories', 'class' => 'App\\Models\\Accessory'],
        'frame' => ['table' => 'frames', 'class' => 'App\\Models\\Frame'],
        'lens' => ['table' => 'lens', 'class' => 'App\\Models\\Lens'],
        'solution' => ['table' => 'solutions', 'class' => 'App\\Models\\Solution'],
    ];

    /** stock event => the column holding when the item was tagged (in event order). */
    protected const TAG_EVENTS = [
        'defective' => 'is_defective',
        'expired' => 'is_expired',
        'returned' => 'is_return',
        'sold' => 'is_sold',
    ];

    protected const CHUNK = 200;

    /** Above this many changed delivery receipts, the whole list is read instead of naming each one. */
    protected const MAX_NAMED_RECEIPTS = 1000;

    /** @var array<string, mixed>|null letter => digit */
    protected ?array $costMap = null;

    /** @var array<string, bool> */
    protected array $schema = [];

    /** @var array<string, bool>|null discount code => VAT-exempt */
    protected ?array $vatExemptCodes = null;

    public function isConfigured(): bool
    {
        return filled(config('database.connections.'.self::CONNECTION.'.database'));
    }

    public function problem(): ?string
    {
        if (! $this->isConfigured()) {
            return 'The optical POS database is not configured.';
        }

        try {
            $this->table('orders')->limit(1)->value('id');

            return null;
        } catch (Throwable $e) {
            return 'The optical POS database cannot be read: '.$e->getMessage();
        }
    }

    public function label(): ?string
    {
        $connection = (array) config('database.connections.'.self::CONNECTION);

        return filled($connection['database'] ?? null)
            ? $connection['database'].(filled($connection['host'] ?? null) ? ' on '.$connection['host'] : '')
            : null;
    }

    public function each(string $stream, array $filters, callable $callback, ?callable $afterPage = null): int
    {
        $since = $filters['since'] ?? null;
        $from = $filters['from'] ?? null;

        $pages = match ($stream) {
            'users' => $this->pages($this->table('users')->orderBy('id'), null, fn (array $ids) => $this->users($ids)),
            'clients' => $this->pages($this->table('clients'), $since, fn (array $ids) => $this->clients($ids)),
            'suppliers' => $this->pages($this->table('suppliers')->whereNull('deleted_at'), $since, fn (array $ids) => $this->suppliers($ids)),
            'payments' => $this->pages($this->table('order_payments'), $since, fn (array $ids) => $this->paymentsById($ids)),
            'orders' => $this->pages($this->table('orders'), $since, fn (array $ids) => $this->ordersById($ids)),
            'receipts' => $this->receiptPages($since, $from),
            'movements' => $this->movementPages($since, $from),
            default => throw new InvalidArgumentException("Unknown optical stream [{$stream}]."),
        };

        $count = 0;
        foreach ($pages as $records) {
            foreach ($records as $record) {
                $count++;
                if ($callback($record) === false) {
                    return $count;
                }
            }

            if ($afterPage && $afterPage() === false) {
                break;
            }
        }

        return $count;
    }

    public function ordersById(array $ids): array
    {
        $ids = $this->ids($ids);
        if ($ids === []) {
            return [];
        }

        $orders = $this->table('orders')->whereIn('id', $ids)->get()->keyBy('id');
        [$patients, $clients] = $this->customers($orders);
        $items = $this->orderItems($ids);
        $invoices = $this->salesInvoices($ids);

        $records = [];
        foreach ($ids as $id) {
            if (! $order = $orders->get($id)) {
                continue;
            }

            $records[] = [
                'id' => (int) $order->id,
                'ts_no' => $order->ts_no,
                'accounting_entity_code' => $this->collectorCode($order),
                'branch' => $order->branch,
                'is_wholesale_order' => (bool) $order->is_wholesale_order,
                'wholesale_client_id' => $this->int($order->wholesale_client_id),
                'wholesale_client_name' => $order->wholesale_client_name,
                'patient_id' => $this->int($order->patient_id),
                'walkin_name' => $order->walkin_name,
                'customer_name' => $this->customerName($order, $patients, $clients),
                'ordered_amount' => $this->money($order->ordered_amount),
                'total_amount' => $this->money($order->total_amount),
                'total_discounted_amount' => $this->money($order->total_discounted_amount),
                'doctors_discount_amount' => $this->money($order->doctors_discount_amount),
                'payable_total' => $this->money($this->payableTotal($order)),
                'vat' => $this->money($order->vat),
                'amount_paid' => $this->money($order->amount_paid),
                'payment_status' => $order->payment_status,
                'payment_type' => $order->payment_type,
                'payment_term' => $order->payment_term,
                'payment_term_count' => $this->int($order->payment_term_count),
                'or' => $order->or,
                'si' => $order->si,
                'sales_invoices' => $invoices[(int) $order->id] ?? [],
                'category' => $order->category,
                'category_vat_exempt' => $this->categoryVatExempt($order->category),
                'completed_at' => $this->iso($order->completed),
                'delivered_at' => $this->iso($order->delivered),
                'created_at' => $this->iso($order->created_at),
                'updated_at' => $this->iso($order->updated_at),
                'deleted_at' => $this->iso($order->deleted_at),
                'items' => $items[(int) $order->id] ?? [],
            ];
        }

        return $records;
    }

    public function paymentsById(array $ids): array
    {
        $ids = $this->ids($ids);
        if ($ids === []) {
            return [];
        }

        $payments = $this->table('order_payments')->whereIn('id', $ids)->get()->keyBy('id');
        $orders = $this->table('orders')->whereIn('id', $payments->pluck('order_id')->unique()->values()->all())->get()->keyBy('id');
        [$patients, $clients] = $this->customers($orders);

        $records = [];
        foreach ($ids as $id) {
            if (! $payment = $payments->get($id)) {
                continue;
            }

            $order = $orders->get($payment->order_id);

            $records[] = [
                'id' => (int) $payment->id,
                'order_id' => (int) $payment->order_id,
                'accounting_entity_code' => $order ? $this->collectorCode($order) : null,
                'amount' => $this->money($payment->amount ?? 0),
                // cash, card or e_wallet; payment_method is the display label (e.g. "BDO · Debit", "GCash").
                'payment_type' => $payment->payment_type,
                'payment_method' => $payment->payment_method,
                'reference_number' => $payment->reference_number,
                'paid_date' => $this->date($payment->paid_date),
                'status' => $payment->status,
                'notes' => $payment->notes,
                ...($order ? ['order' => [
                    'id' => (int) $order->id,
                    'ts_no' => $order->ts_no,
                    'branch' => $order->branch,
                    'is_wholesale_order' => (bool) $order->is_wholesale_order,
                    'wholesale_client_id' => $this->int($order->wholesale_client_id),
                    'patient_id' => $this->int($order->patient_id),
                    'customer_name' => $this->customerName($order, $patients, $clients),
                    'payable_total' => $this->money($this->payableTotal($order)),
                    'or' => $order->or,
                    'si' => $order->si,
                    'completed_at' => $this->iso($order->completed),
                    'deleted_at' => $this->iso($order->deleted_at),
                ]] : []),
                'created_at' => $this->iso($payment->created_at),
                'updated_at' => $this->iso($payment->updated_at),
                'deleted_at' => $this->iso($payment->deleted_at),
            ];
        }

        return $records;
    }

    public function stockSummary(): array
    {
        $threshold = (int) config('optical.low_stock_threshold', 3);
        $onHand = [];
        $value = [];
        $groups = [];

        foreach (self::STOCK as $type => $definition) {
            // Available rows: not sold, defective, inactive or disposable. One pass per table, grouped down to the
            // cost code so each code is decoded once.
            $rows = $this->table($definition['table'])
                ->whereNull('deleted_at')
                ->whereNull('is_sold')
                ->whereNull('is_defective')
                ->whereNull('is_not_active')
                ->whereNull('is_disposable')
                ->select(['brand', 'code', 'category', 'item_cost_code', DB::raw('COUNT(*) as n'), DB::raw('MIN(COALESCE(quantity, 1)) as min_quantity')])
                ->groupBy('brand', 'code', 'category', 'item_cost_code')
                ->get();

            $onHand[$type] = 0;
            $value[$type] = 0.0;
            $typeGroups = [];

            foreach ($rows as $row) {
                $count = (int) $row->n;
                $cost = $this->unitCost($row->item_cost_code) * $count;
                $key = mb_strtolower(trim((string) $row->brand)."\u{0}".trim((string) $row->code)."\u{0}".trim((string) $row->category));

                $onHand[$type] += $count;
                $value[$type] += $cost;
                $typeGroups[$key] ??= ['stock_type' => $type, 'brand' => $row->brand, 'code' => $row->code, 'category' => $row->category, 'on_hand_count' => 0, 'on_hand_value' => 0.0, 'min_quantity' => null];
                $typeGroups[$key]['on_hand_count'] += $count;
                $typeGroups[$key]['on_hand_value'] += $cost;
                $typeGroups[$key]['min_quantity'] = min($typeGroups[$key]['min_quantity'] ?? PHP_INT_MAX, (int) ($row->min_quantity ?? 1));
            }

            $value[$type] = round($value[$type], 2);

            foreach ($typeGroups as $group) {
                $groups[] = [
                    ...$group,
                    'on_hand_value' => round($group['on_hand_value'], 2),
                    'is_low_stock' => $group['on_hand_count'] <= $threshold || $group['min_quantity'] <= 1,
                ];
            }
        }

        usort($groups, fn (array $a, array $b) => $a['on_hand_count'] <=> $b['on_hand_count']);

        return [
            'on_hand_by_type' => $onHand,
            'on_hand_total' => array_sum($onHand),
            'on_hand_value_by_type' => $value,
            'on_hand_value_total' => round(array_sum($value), 2),
            'low_stock_threshold' => $threshold,
            'groups' => $groups,
        ];
    }

    public function services(): array
    {
        $billedBy = $this->hasColumn('service_fees', 'billed_by');

        return $this->table('service_fees')
            ->orderBy('name')
            ->get(['id', 'name', 'deleted_at', ...($billedBy ? ['billed_by'] : [])])
            ->map(fn (object $fee) => [
                'id' => (int) $fee->id,
                'name' => (string) $fee->name,
                'billed_by' => $billedBy ? ($fee->billed_by ?? 'branch') : null,
                'is_active' => $fee->deleted_at === null,
            ])
            ->all();
    }

    public function passwordMatches(int $opticalUserId, string $password): ?bool
    {
        if (! $this->isConfigured()) {
            return null;
        }

        try {
            $user = $this->table('users')->where('id', $opticalUserId)->first(['status', 'password']);
        } catch (Throwable $e) {
            report($e);

            return null;
        }

        // Only the answer leaves this method; the POS's stored password is compared here and dropped.
        return $user !== null && (bool) $user->status && password_verify($password, (string) $user->password);
    }

    /**
     * Decoded peso cost of a stock cost code: each letter is a digit (cost_code_mappings), letters without a digit
     * are fillers, and a "." is the decimal point. "AB.AC" with A=1, B=2, C=3 is 12.13.
     */
    public function unitCost(?string $costCode): float
    {
        $code = strtoupper(trim((string) $costCode));
        if ($code === '') {
            return 0.0;
        }

        $this->costMap ??= $this->table('cost_code_mappings')->pluck('value', 'letter')->all();

        $digits = '';
        foreach (str_split($code) as $character) {
            if ($character === '.') {
                $digits .= '.';

                continue;
            }

            $value = $this->costMap[$character] ?? null;
            if ($value === null || $value === '' || ! is_numeric($value)) {
                continue;
            }

            $number = (float) $value;
            if (floor($number) == $number && $number >= 0 && $number <= 9) {
                $digits .= (string) (int) $number;
            }
        }

        return is_numeric($digits) ? round((float) $digits, 2) : 0.0;
    }

    protected function db(): ConnectionInterface
    {
        return DB::connection(self::CONNECTION);
    }

    protected function table(string $table): Builder
    {
        return $this->db()->table($table);
    }

    /**
     * A table's rows oldest change first, in batches: the ids are listed once, then each batch is read by id.
     *
     * @param  callable(list<int>): list<array<string, mixed>>  $read
     * @return Generator<int, list<array<string, mixed>>>
     */
    protected function pages(Builder $query, ?CarbonInterface $since, callable $read): Generator
    {
        if ($since !== null) {
            $query->where('updated_at', '>=', $this->stamp($since));
        }

        $ids = $query->orderBy('updated_at')->orderBy('id')->pluck('id')->all();

        foreach (array_chunk($ids, self::CHUNK) as $chunk) {
            yield $read($this->ids($chunk));
        }
    }

    /**
     * @param  list<int>  $ids
     * @return list<array<string, mixed>>
     */
    protected function users(array $ids): array
    {
        $users = $this->table('users')->whereIn('id', $ids)->orderBy('id')->get([
            'id', 'username', 'email', 'firstname', 'middlename', 'lastname', 'sex', 'contact_number', 'address',
            'birthdate', 'position', 'date_started', 'avatar', 'status', 'created_at', 'updated_at',
        ]);

        try {
            $roles = $this->table('model_has_roles')
                ->join('roles', 'roles.id', '=', 'model_has_roles.role_id')
                ->where('model_has_roles.model_type', 'App\\Models\\User')
                ->whereIn('model_has_roles.model_id', $ids)
                ->orderBy('roles.id')
                ->get(['model_has_roles.model_id', 'roles.name'])
                ->groupBy('model_id');
        } catch (Throwable) {
            $roles = collect();
        }

        return $users->map(fn (object $user) => [
            'id' => (int) $user->id,
            'username' => $user->username,
            'email' => $user->email,
            'firstname' => $user->firstname,
            'middlename' => $user->middlename,
            'lastname' => $user->lastname,
            'sex' => $user->sex,
            'contact_number' => $user->contact_number,
            'address' => $user->address,
            'birthdate' => $this->date($user->birthdate),
            'position' => $user->position,
            'date_started' => $this->date($user->date_started),
            ...$this->photo($user->avatar),
            'status' => (bool) $user->status,
            'roles' => ($roles->get($user->id) ?? collect())->pluck('name')->values()->all(),
            'created_at' => $this->iso($user->created_at),
            'updated_at' => $this->iso($user->updated_at),
        ])->all();
    }

    /**
     * Where a user's photo is: the file in the POS's public storage when that folder is at hand, and its address
     * on the POS's site.
     *
     * @return array{avatar_url: string|null, avatar_path: string|null}
     */
    protected function photo(?string $avatar): array
    {
        $avatar = trim((string) $avatar);
        if ($avatar === '') {
            return ['avatar_url' => null, 'avatar_path' => null];
        }

        if (str_starts_with($avatar, 'http')) {
            return ['avatar_url' => $avatar, 'avatar_path' => null];
        }

        $folder = rtrim((string) config('optical.storage_path'), '/\\');
        $file = $folder !== '' ? $folder.DIRECTORY_SEPARATOR.str_replace(['/', '\\'], DIRECTORY_SEPARATOR, ltrim($avatar, '/\\')) : null;
        $site = rtrim((string) config('optical.public_url'), '/');

        return [
            'avatar_url' => $site !== '' ? $site.'/storage/'.ltrim($avatar, '/') : null,
            'avatar_path' => $file !== null && ! str_contains($avatar, '..') && is_file($file) ? $file : null,
        ];
    }

    /**
     * @param  list<int>  $ids
     * @return list<array<string, mixed>>
     */
    protected function clients(array $ids): array
    {
        return $this->inOrder($ids, $this->table('clients')->whereIn('id', $ids)->get(), fn (object $client) => [
            'id' => (int) $client->id,
            'name' => $client->name,
            'contact_person' => $client->contact_person,
            'phone' => $client->phone,
            'email' => $client->email,
            'address' => $client->address,
            'tin' => $client->tin,
            'terms' => $client->terms,
            'notes' => $client->notes,
            'status' => $client->status,
            'created_at' => $this->iso($client->created_at),
            'updated_at' => $this->iso($client->updated_at),
        ]);
    }

    /**
     * @param  list<int>  $ids
     * @return list<array<string, mixed>>
     */
    protected function suppliers(array $ids): array
    {
        return $this->inOrder($ids, $this->table('suppliers')->whereIn('id', $ids)->get(), fn (object $supplier) => [
            'id' => (int) $supplier->id,
            'name' => $supplier->name,
            'code' => $supplier->code,
            'contact_number' => $supplier->contact_number,
            'address' => $supplier->address,
            'email' => $supplier->email,
            'tin' => $supplier->tin,
            'created_at' => $this->iso($supplier->created_at),
            'updated_at' => $this->iso($supplier->updated_at),
        ]);
    }

    /**
     * Supplier deliveries, oldest change first: stock rows grouped by supplier and delivery receipt, valued at
     * decoded unit cost. A delivery reappears whenever one of its rows changes, is added or is removed.
     *
     * @return Generator<int, list<array<string, mixed>>>
     */
    protected function receiptPages(?CarbonInterface $since, ?string $from): Generator
    {
        $named = null;

        if ($since !== null) {
            $changed = [];
            foreach (self::STOCK as $definition) {
                // Deleted rows count as changes: removing an item re-values its delivery.
                $this->table($definition['table'])
                    ->where('updated_at', '>=', $this->stamp($since))
                    ->whereNotNull('delivery_receipt')
                    ->where('delivery_receipt', '!=', '')
                    ->distinct()
                    ->pluck('delivery_receipt')
                    ->each(function ($receipt) use (&$changed): void {
                        $changed[(string) $receipt] = true;
                    });
            }

            if ($changed === []) {
                return;
            }

            $named = count($changed) <= self::MAX_NAMED_RECEIPTS ? array_map('strval', array_keys($changed)) : null;
        }

        $union = null;
        foreach (self::STOCK as $definition) {
            $query = $this->table($definition['table'])
                ->select([
                    DB::raw("COALESCE(supplier, '') as supplier"),
                    'delivery_receipt',
                    DB::raw('COALESCE(delivery_date, created_at) as received_at'),
                    'updated_at',
                ])
                ->whereNull('deleted_at')
                ->whereNotNull('delivery_receipt')
                ->where('delivery_receipt', '!=', '');

            if ($named !== null) {
                $query->whereIn('delivery_receipt', $named);
            }

            $union = $union === null ? $query : $union->unionAll($query);
        }

        $receipts = $this->db()->query()
            ->fromSub($union, 'stock_rows')
            ->select([
                'supplier',
                'delivery_receipt',
                DB::raw('MIN(received_at) as received_at'),
                DB::raw('MAX(updated_at) as updated_at'),
                DB::raw('COUNT(*) as item_count'),
            ])
            ->groupBy('supplier', 'delivery_receipt')
            ->get()
            ->filter(fn (object $r) => $from === null || substr((string) $r->received_at, 0, 10) >= $from)
            // Only when the whole list was read: a named delivery is already known to have changed.
            ->filter(fn (object $r) => $since === null || $named !== null || (string) $r->updated_at >= $this->stamp($since))
            ->sort(fn (object $a, object $b) => [(string) $a->updated_at, (string) $a->supplier, (string) $a->delivery_receipt] <=> [(string) $b->updated_at, (string) $b->supplier, (string) $b->delivery_receipt])
            ->values();

        foreach ($receipts->chunk(100) as $chunk) {
            yield $this->valueReceipts($chunk->values());
        }
    }

    /**
     * Cost each delivery: count its rows per stock type and cost code, decoding each code once.
     *
     * @param  Collection<int, object>  $receipts
     * @return list<array<string, mixed>>
     */
    protected function valueReceipts(Collection $receipts): array
    {
        $keys = $receipts->map(fn (object $r) => $r->supplier."\u{0}".$r->delivery_receipt)->flip();
        $totals = [];

        foreach (self::STOCK as $type => $definition) {
            $this->table($definition['table'])
                ->select([
                    DB::raw("COALESCE(supplier, '') as supplier"),
                    'delivery_receipt',
                    'item_cost_code',
                    'price',
                    DB::raw('COUNT(*) as n'),
                ])
                ->whereNull('deleted_at')
                ->whereIn('delivery_receipt', $receipts->pluck('delivery_receipt')->unique()->values()->all())
                ->groupBy(DB::raw("COALESCE(supplier, '')"), 'delivery_receipt', 'item_cost_code', 'price')
                ->get()
                ->each(function (object $row) use ($keys, $type, &$totals): void {
                    $key = $row->supplier."\u{0}".$row->delivery_receipt;
                    if (! $keys->has($key)) {
                        return;
                    }

                    $unitCost = $this->unitCost($row->item_cost_code);
                    $count = (int) $row->n;

                    $totals[$key]['total_cost'] = ($totals[$key]['total_cost'] ?? 0) + $unitCost * $count;
                    $totals[$key]['uncosted_count'] = ($totals[$key]['uncosted_count'] ?? 0) + ($unitCost > 0 ? 0 : $count);
                    // A cost above the selling price is usually a cost code keyed without its "." (centavos).
                    $price = (float) $row->price;
                    if ($price > 0 && $unitCost > $price) {
                        $totals[$key]['overcost_count'] = ($totals[$key]['overcost_count'] ?? 0) + $count;
                        $totals[$key]['overcost_cost'] = ($totals[$key]['overcost_cost'] ?? 0) + $unitCost * $count;
                    }
                    $totals[$key]['by_type'][$type]['count'] = ($totals[$key]['by_type'][$type]['count'] ?? 0) + $count;
                    $totals[$key]['by_type'][$type]['cost'] = ($totals[$key]['by_type'][$type]['cost'] ?? 0) + $unitCost * $count;
                });
        }

        $supplierIds = $this->supplierIds($receipts->pluck('supplier'));

        return $receipts->map(function (object $receipt) use ($totals, $supplierIds) {
            $key = $receipt->supplier."\u{0}".$receipt->delivery_receipt;
            $supplier = (string) $receipt->supplier;

            return [
                'key' => sha1($key),
                'supplier' => $supplier !== '' ? $supplier : null,
                'supplier_id' => $supplier !== '' ? ($supplierIds[$supplier] ?? null) : null,
                'delivery_receipt' => $receipt->delivery_receipt,
                'received_at' => $receipt->received_at,
                'item_count' => (int) $receipt->item_count,
                'uncosted_count' => (int) ($totals[$key]['uncosted_count'] ?? 0),
                'total_cost' => $this->money($totals[$key]['total_cost'] ?? 0),
                // Items whose decoded cost is above their selling price, and their cost (included in total_cost).
                'overcost_count' => (int) ($totals[$key]['overcost_count'] ?? 0),
                'overcost_cost' => $this->money($totals[$key]['overcost_cost'] ?? 0),
                'by_type' => array_map(fn (array $t) => ['count' => (int) $t['count'], 'cost' => $this->money($t['cost'])], $totals[$key]['by_type'] ?? []),
                'updated_at' => $receipt->updated_at,
            ];
        })->all();
    }

    /**
     * Stock tagged sold, defective, expired or returned, oldest change first; one record per item and event. Each
     * stock row is a single unit.
     *
     * @return Generator<int, list<array<string, mixed>>>
     */
    protected function movementPages(?CarbonInterface $since, ?string $from): Generator
    {
        $rows = [];

        foreach (self::STOCK as $type => $definition) {
            $query = $this->table($definition['table'])
                ->whereNull('deleted_at')
                ->where(function (Builder $tagged): void {
                    foreach (self::TAG_EVENTS as $column) {
                        $tagged->orWhereNotNull($column);
                    }
                });

            if ($since !== null) {
                $query->where('updated_at', '>=', $this->stamp($since));
            }

            foreach ($query->get(['id', 'updated_at']) as $row) {
                $rows[] = [(string) $row->updated_at, $type, (int) $row->id];
            }
        }

        usort($rows, fn (array $a, array $b) => $a <=> $b);

        foreach (array_chunk($rows, self::CHUNK) as $chunk) {
            yield $this->movements($chunk, $from);
        }
    }

    /**
     * @param  list<array{0: string, 1: string, 2: int}>  $chunk  [updated at, stock type, id]
     * @return list<array<string, mixed>>
     */
    protected function movements(array $chunk, ?string $from): array
    {
        $idsByType = [];
        foreach ($chunk as [, $type, $id]) {
            $idsByType[$type][] = $id;
        }

        $rows = [];
        $orderIds = [];
        foreach ($idsByType as $type => $ids) {
            $rows[$type] = $this->table(self::STOCK[$type]['table'])
                ->whereIn('id', $ids)
                ->get(['id', 'code', 'brand', 'description', 'category', 'item_cost_code', 'price', 'supplier', 'delivery_receipt', 'out_branch', 'quantity', 'updated_at', ...array_values(self::TAG_EVENTS)])
                ->keyBy('id');

            // The completed order whose line carried a sold item (completing an order tags its items sold).
            $sold = $rows[$type]->whereNotNull('is_sold')->keys()->all();
            if ($sold !== []) {
                $this->table('order_items')
                    ->join('orders', 'orders.id', '=', 'order_items.order_id')
                    ->where('order_items.products_type', self::STOCK[$type]['class'])
                    ->whereIn('order_items.products_id', $sold)
                    ->whereNull('order_items.deleted_at')
                    ->whereNull('orders.deleted_at')
                    ->whereNotNull('orders.completed')
                    ->orderBy('order_items.id')
                    ->get(['order_items.order_id', 'order_items.products_id'])
                    ->each(function (object $item) use (&$orderIds, $type): void {
                        $orderIds[$type.':'.$item->products_id] = (int) $item->order_id;
                    });
            }
        }

        $supplierIds = $this->supplierIds(collect($rows)->flatMap(fn (Collection $typeRows) => $typeRows->pluck('supplier')));

        $records = [];
        foreach ($chunk as [, $type, $id]) {
            if (! $row = $rows[$type]->get($id)) {
                continue;
            }

            foreach (self::TAG_EVENTS as $event => $column) {
                $occurredAt = $row->{$column};
                if ($occurredAt === null || ($from !== null && substr((string) $occurredAt, 0, 10) < $from)) {
                    continue;
                }

                $records[] = [
                    'id' => (int) $row->id,
                    'stock_type' => $type,
                    'event_type' => $event,
                    'code' => $row->code,
                    'brand' => $row->brand,
                    'description' => $row->description,
                    'category' => $row->category,
                    'item_cost_code' => $row->item_cost_code,
                    'unit_cost' => $this->money($this->unitCost($row->item_cost_code)),
                    'price' => $this->money($row->price ?? 0),
                    'supplier' => $row->supplier,
                    'supplier_id' => $row->supplier !== null ? ($supplierIds[$row->supplier] ?? null) : null,
                    'delivery_receipt' => $row->delivery_receipt,
                    'out_branch' => $row->out_branch,
                    'order_id' => $event === 'sold' ? ($orderIds[$type.':'.$row->id] ?? null) : null,
                    'quantity' => isset($row->quantity) ? (int) $row->quantity : null,
                    'occurred_at' => $occurredAt,
                    'updated_at' => $row->updated_at,
                ];
            }
        }

        return $records;
    }

    /**
     * Stock rows name their supplier; the supplier's id is the first supplier record with that name.
     *
     * @param  Collection<int, mixed>  $names
     * @return array<string, int>
     */
    protected function supplierIds(Collection $names): array
    {
        $names = $names->filter()->unique()->values();
        if ($names->isEmpty()) {
            return [];
        }

        $ids = [];
        foreach ($this->table('suppliers')->whereNull('deleted_at')->whereIn('name', $names->all())->orderBy('id')->get(['id', 'name']) as $supplier) {
            $ids[$supplier->name] ??= (int) $supplier->id;
        }

        return $ids;
    }

    /**
     * Line items of the orders, each with its product (kept even after the product was deleted, so the decoded unit
     * cost survives).
     *
     * @param  list<int>  $orderIds
     * @return array<int, list<array<string, mixed>>>
     */
    protected function orderItems(array $orderIds): array
    {
        $items = $this->table('order_items')->whereIn('order_id', $orderIds)->whereNull('deleted_at')->orderBy('id')->get();
        $billedBy = $this->hasColumn('service_fees', 'billed_by');

        $products = [];
        foreach ($items->groupBy('products_type') as $class => $group) {
            $isService = $class === self::SERVICE_CLASS;
            $table = $isService ? 'service_fees' : (collect(self::STOCK)->firstWhere('class', $class)['table'] ?? null);
            if ($table === null) {
                continue;
            }

            $columns = $isService
                ? ['id', 'name', 'item_cost_code', ...($billedBy ? ['billed_by'] : [])]
                : ['id', 'code', 'brand', 'description', 'item_cost_code'];

            foreach ($this->table($table)->whereIn('id', $group->pluck('products_id')->unique()->values()->all())->get($columns) as $product) {
                $products[$class.':'.$product->id] = $product;
            }
        }

        $byOrder = [];
        foreach ($items as $item) {
            $product = $products[$item->products_type.':'.$item->products_id] ?? null;
            $isService = $item->products_type === self::SERVICE_CLASS;
            $amount = (float) $item->amount;
            $discount = (float) $item->discount_amount;

            $byOrder[(int) $item->order_id][] = [
                'id' => (int) $item->id,
                'products_type' => $item->products_type,
                'products_id' => (int) $item->products_id,
                'stock_type' => $isService ? 'service_fee' : (collect(self::STOCK)->search(fn (array $d) => $d['class'] === $item->products_type) ?: null),
                'is_service' => $isService,
                // Who earns a service fee (Libraries › Service Fees): "jam_opticus" or "branch" (the branch's clinic).
                'billed_by' => $isService && $billedBy ? ($product->billed_by ?? 'branch') : null,
                // The company that earns the line is decided in accounting (OpticalRouter), from the above.
                'accounting_entity_code' => null,
                'product_label' => $this->productLabel($product),
                'product_code' => $product->code ?? null,
                'quantity' => (int) $item->quantity,
                // amount is the line total after the line discount; gross is the line before any discount.
                'gross_amount' => $this->money($amount + $discount),
                'discount_amount' => $this->money($item->discount_amount),
                'amount' => $this->money($item->amount),
                'unit_cost' => $this->money($this->unitCost($product->item_cost_code ?? null)),
                'is_pre_order' => (bool) $item->is_pre_order,
                'expected_stock_date' => $this->date($item->expected_stock_date),
                'created_at' => $this->iso($item->created_at),
                'updated_at' => $this->iso($item->updated_at),
            ];
        }

        return $byOrder;
    }

    protected function productLabel(?object $product): ?string
    {
        if ($product === null) {
            return null;
        }

        if (isset($product->name)) {
            return (string) $product->name;
        }

        $parts = array_filter([$product->brand ?? null, $product->description ?? null, $product->code ?? null]);

        return $parts !== [] ? implode(' — ', $parts) : null;
    }

    /**
     * Each company's own Sales Invoice number for its part of an order.
     *
     * @param  list<int>  $orderIds
     * @return array<int, list<array{entity_code: string, si_no: string}>>
     */
    protected function salesInvoices(array $orderIds): array
    {
        if (! $this->hasTable('order_sales_invoices')) {
            return [];
        }

        $byOrder = [];
        foreach ($this->table('order_sales_invoices')->whereIn('order_id', $orderIds)->orderBy('id')->get(['order_id', 'entity_code', 'si_no']) as $invoice) {
            $byOrder[(int) $invoice->order_id][] = ['entity_code' => $invoice->entity_code, 'si_no' => $invoice->si_no];
        }

        return $byOrder;
    }

    /**
     * The patients and wholesale clients the orders are for.
     *
     * @param  Collection<int|string, object>  $orders
     * @return array{0: Collection<int|string, object>, 1: Collection<int|string, object>}
     */
    protected function customers(Collection $orders): array
    {
        $patientIds = $orders->pluck('patient_id')->filter()->unique()->values()->all();
        $clientIds = $orders->pluck('wholesale_client_id')->filter()->unique()->values()->all();

        return [
            $patientIds === [] ? collect() : $this->table('patients')->whereIn('id', $patientIds)->get(['id', 'firstname', 'middlename', 'lastname', 'extension_name'])->keyBy('id'),
            $clientIds === [] ? collect() : $this->table('clients')->whereIn('id', $clientIds)->get(['id', 'name'])->keyBy('id'),
        ];
    }

    /**
     * Who the order is for: the wholesale client, the patient, or the walk-in name.
     *
     * @param  Collection<int|string, object>  $patients
     * @param  Collection<int|string, object>  $clients
     */
    protected function customerName(object $order, Collection $patients, Collection $clients): ?string
    {
        if ($order->is_wholesale_order) {
            $client = $order->wholesale_client_id ? $clients->get($order->wholesale_client_id) : null;

            return ($client->name ?? null) ?: $order->wholesale_client_name;
        }

        $patient = $order->patient_id ? $patients->get($order->patient_id) : null;
        if ($patient !== null) {
            $name = trim(implode(' ', array_filter([$patient->firstname, $patient->middlename, $patient->lastname, $patient->extension_name])));

            if ($name !== '') {
                return $name;
            }
        }

        return $order->walkin_name;
    }

    /**
     * What the customer owes after every discount. Older rows stored total_amount before the doctor's discount.
     */
    protected function payableTotal(object $order): float
    {
        $total = (float) ($order->total_amount ?? 0);
        $discounted = (float) ($order->total_discounted_amount ?? $total);
        $doctors = (float) ($order->doctors_discount_amount ?? 0);

        if ($doctors > 0 && abs($total - $discounted) < 0.005) {
            return max(0, round($discounted - $doctors, 2));
        }

        return max(0, round($total, 2));
    }

    /** The entity that collects the order's money, as the books will decide it (OpticalRouter::collectorFor). */
    protected function collectorCode(object $order): string
    {
        if ($order->is_wholesale_order) {
            return (string) config('optical.wholesale_entity', 'JAM_OPTICUS');
        }

        $branch = strtolower(trim((string) $order->branch));

        return (string) (config('optical.branch_entities', [])[$branch] ?? config('optical.default_branch_entity', 'A_JAMORA'));
    }

    /**
     * Whether the order's discount (Libraries › Discounts) makes the sale VAT-exempt; null without a known discount
     * or when the POS has no such setting yet.
     */
    protected function categoryVatExempt(?string $category): ?bool
    {
        $code = strtoupper(trim((string) $category));
        if ($code === '' || ! $this->hasColumn('discounts', 'is_vat_exempt')) {
            return null;
        }

        $this->vatExemptCodes ??= $this->table('discounts')->get(['code', 'is_vat_exempt'])
            ->mapWithKeys(fn (object $d) => [strtoupper(trim((string) $d->code)) => (bool) $d->is_vat_exempt])
            ->all();

        return $this->vatExemptCodes[$code] ?? null;
    }

    protected function hasTable(string $table): bool
    {
        return $this->schema[$table] ??= $this->db()->getSchemaBuilder()->hasTable($table);
    }

    protected function hasColumn(string $table, string $column): bool
    {
        return $this->schema["{$table}.{$column}"] ??= $this->db()->getSchemaBuilder()->hasColumn($table, $column);
    }

    /**
     * @template T
     *
     * @param  list<int>  $ids
     * @param  Collection<int, object>  $rows
     * @param  callable(object): T  $map
     * @return list<T>
     */
    protected function inOrder(array $ids, Collection $rows, callable $map): array
    {
        $rows = $rows->keyBy('id');

        return array_values(array_map($map, array_filter(array_map(fn (int $id) => $rows->get($id), $ids))));
    }

    /**
     * @param  array<int, mixed>  $ids
     * @return list<int>
     */
    protected function ids(array $ids): array
    {
        return array_values(array_unique(array_filter(array_map('intval', $ids), fn (int $id) => $id > 0)));
    }

    protected function int(mixed $value): ?int
    {
        return $value === null ? null : (int) $value;
    }

    protected function money(mixed $value): ?string
    {
        return $value === null ? null : number_format((float) $value, 2, '.', '');
    }

    /** A date column as Y-m-d. */
    protected function date(mixed $value): ?string
    {
        return $value === null || $value === '' ? null : substr((string) $value, 0, 10);
    }

    /** A POS timestamp (kept in the POS's time zone, without an offset) as ISO-8601. */
    protected function iso(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return Carbon::parse((string) $value, $this->timezone())->toIso8601String();
    }

    /** A moment as the POS stores it. */
    protected function stamp(CarbonInterface $moment): string
    {
        return $moment->copy()->setTimezone($this->timezone())->format('Y-m-d H:i:s');
    }

    protected function timezone(): string
    {
        return (string) config('optical.timezone', 'UTC');
    }
}
