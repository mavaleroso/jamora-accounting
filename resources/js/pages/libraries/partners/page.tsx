import { Head, router, usePage } from '@inertiajs/react';
import { PlusIcon } from 'lucide-react';
import * as React from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';
import { TableShell } from '@/components/ui/table-shell';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Partners', href: '/libraries/partners' }];

type Partner = {
    id: number;
    code: string;
    name: string;
    type: string;
    tin?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    is_active: boolean;
    balance?: { balance: string | number } | null;
};

type Props = {
    partners: Partner[];
    totalPartners: number;
    pageSize: number;
    currentPage: number;
    search?: string;
};

function PartnerForm({
    defaultValues,
    errors,
    onSubmit,
    submitLabel,
}: {
    defaultValues?: Partial<Partner>;
    errors: Record<string, string>;
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    submitLabel: string;
}) {
    const [processing, setProcessing] = React.useState(false);
    const [partnerType, setPartnerType] = React.useState(defaultValues?.type ?? 'customer');

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setProcessing(true);
        onSubmit(e);
    };

    return (
        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
            <input type="hidden" name="type" value={partnerType} />
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <Label htmlFor="code">Code *</Label>
                    <Input id="code" name="code" defaultValue={defaultValues?.code ?? ''} />
                    <InputError message={errors.code} />
                </div>
                <div>
                    <Label htmlFor="name">Name *</Label>
                    <Input id="name" name="name" defaultValue={defaultValues?.name ?? ''} />
                    <InputError message={errors.name} />
                </div>
                <div>
                    <Label htmlFor="type">Type *</Label>
                    <Select value={partnerType} onValueChange={setPartnerType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="customer">Customer</SelectItem>
                            <SelectItem value="patient">Patient</SelectItem>
                            <SelectItem value="wholesale">Wholesale</SelectItem>
                        </SelectContent>
                    </Select>
                    <InputError message={errors.type} />
                </div>
                <div>
                    <Label htmlFor="tin">TIN</Label>
                    <Input id="tin" name="tin" defaultValue={defaultValues?.tin ?? ''} />
                </div>
                <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" defaultValue={defaultValues?.email ?? ''} />
                </div>
                <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" name="phone" defaultValue={defaultValues?.phone ?? ''} />
                </div>
                <div className="sm:col-span-2">
                    <Label htmlFor="address">Address</Label>
                    <Input id="address" name="address" defaultValue={defaultValues?.address ?? ''} />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                    <Checkbox id="is_active" name="is_active" value="1" defaultChecked={defaultValues?.is_active ?? true} />
                    <Label htmlFor="is_active" className="font-normal">Active</Label>
                </div>
            </div>
            <Button type="submit" disabled={processing}>{processing ? 'Saving...' : submitLabel}</Button>
        </form>
    );
}

export default function PartnersPage({ partners, totalPartners, pageSize, currentPage, search = '' }: Props) {
    const { errors = {} } = usePage().props as { errors?: Record<string, string> };
    const [createOpen, setCreateOpen] = React.useState(false);
    const [editOpen, setEditOpen] = React.useState(false);
    const [deleteOpen, setDeleteOpen] = React.useState(false);
    const [selected, setSelected] = React.useState<Partner | null>(null);
    const [deleting, setDeleting] = React.useState(false);

    const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
        router.post('/libraries/partners', new FormData(e.currentTarget), {
            preserveScroll: true,
            onSuccess: () => { setCreateOpen(false); e.currentTarget.reset(); },
        });
    };

    const handleEdit = (e: React.FormEvent<HTMLFormElement>) => {
        if (!selected) return;
        const fd = new FormData(e.currentTarget);
        fd.append('_method', 'PUT');
        router.post(`/libraries/partners/${selected.id}`, fd, {
            preserveScroll: true,
            onSuccess: () => setEditOpen(false),
        });
    };

    const handleDelete = () => {
        if (!selected) return;
        setDeleting(true);
        router.delete(`/libraries/partners/${selected.id}`, {
            preserveScroll: true,
            onSuccess: () => { setDeleteOpen(false); setSelected(null); },
            onFinish: () => setDeleting(false),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Partners" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading title="Partners" description="Manage customers and wholesale partners" />
                    <Button onClick={() => setCreateOpen(true)}><PlusIcon className="size-4" />Create partner</Button>
                </div>
                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Code</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Balance</TableHead>
                                <TableHead>Active</TableHead>
                                <TableHead className="w-[120px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {partners.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-muted-foreground text-center">No partners found.</TableCell></TableRow>
                            ) : partners.map((p) => (
                                <TableRow key={p.id}>
                                    <TableCell className="font-mono">{p.code}</TableCell>
                                    <TableCell>{p.name}</TableCell>
                                    <TableCell><Badge variant="outline">{p.type}</Badge></TableCell>
                                    <TableCell>{Number(p.balance?.balance ?? 0).toFixed(2)}</TableCell>
                                    <TableCell><Badge variant={p.is_active ? 'default' : 'secondary'}>{p.is_active ? 'Yes' : 'No'}</Badge></TableCell>
                                    <TableCell className="space-x-2">
                                        <Button variant="ghost" size="sm" onClick={() => { setSelected(p); setEditOpen(true); }}>Edit</Button>
                                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { setSelected(p); setDeleteOpen(true); }}>Delete</Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableShell>
                <p className="text-muted-foreground text-sm">Showing {partners.length} of {totalPartners} (page {currentPage}, {pageSize} per page)</p>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent><DialogHeader><DialogTitle>Create partner</DialogTitle></DialogHeader>
                    <PartnerForm errors={errors} onSubmit={handleCreate} submitLabel="Create partner" />
                </DialogContent>
            </Dialog>
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent><DialogHeader><DialogTitle>Edit partner</DialogTitle></DialogHeader>
                    {selected && <PartnerForm defaultValues={selected} errors={errors} onSubmit={handleEdit} submitLabel="Save changes" />}
                </DialogContent>
            </Dialog>
            <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete partner" description={`Delete "${selected?.code}"?`} confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} loading={deleting} />
        </AppLayout>
    );
}
