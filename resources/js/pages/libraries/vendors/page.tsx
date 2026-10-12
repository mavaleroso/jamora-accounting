import { Head, router, usePage } from '@inertiajs/react';
import { PlusIcon } from 'lucide-react';
import * as React from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Vendors', href: '/libraries/vendors' }];

type Vendor = {
    id: number;
    code: string;
    name: string;
    tin?: string | null;
    email?: string | null;
    phone?: string | null;
    is_active: boolean;
};

type Props = {
    vendors: Vendor[];
    totalVendors: number;
    pageSize: number;
    currentPage: number;
};

export default function VendorsPage({ vendors, totalVendors, pageSize, currentPage }: Props) {
    const { errors = {} } = usePage().props as { errors?: Record<string, string> };
    const [createOpen, setCreateOpen] = React.useState(false);
    const [editOpen, setEditOpen] = React.useState(false);
    const [deleteOpen, setDeleteOpen] = React.useState(false);
    const [selected, setSelected] = React.useState<Vendor | null>(null);
    const [deleting, setDeleting] = React.useState(false);

    const VendorForm = ({ defaults }: { defaults?: Vendor }) => (
        <form
            className="grid gap-4 py-2 sm:grid-cols-2"
            onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                if (defaults) {
                    fd.append('_method', 'PUT');
                    router.post(`/libraries/vendors/${defaults.id}`, fd, { preserveScroll: true, onSuccess: () => setEditOpen(false) });
                } else {
                    router.post('/libraries/vendors', fd, { preserveScroll: true, onSuccess: () => { setCreateOpen(false); e.currentTarget.reset(); } });
                }
            }}
        >
            <div><Label>Code *</Label><Input name="code" defaultValue={defaults?.code} /><InputError message={errors.code} /></div>
            <div><Label>Name *</Label><Input name="name" defaultValue={defaults?.name} /><InputError message={errors.name} /></div>
            <div><Label>TIN</Label><Input name="tin" defaultValue={defaults?.tin ?? ''} /></div>
            <div><Label>Email</Label><Input name="email" type="email" defaultValue={defaults?.email ?? ''} /></div>
            <div><Label>Phone</Label><Input name="phone" defaultValue={defaults?.phone ?? ''} /></div>
            <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox name="is_active" value="1" defaultChecked={defaults?.is_active ?? true} />
                <Label className="font-normal">Active</Label>
            </div>
            <div className="sm:col-span-2"><Button type="submit">{defaults ? 'Save changes' : 'Create vendor'}</Button></div>
        </form>
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Vendors" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading title="Vendors" description="Manage accounts payable vendors" />
                    <Button onClick={() => setCreateOpen(true)}><PlusIcon className="size-4" />Create vendor</Button>
                </div>
                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Code</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>TIN</TableHead>
                                <TableHead>Active</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {vendors.map((v) => (
                                <TableRow key={v.id}>
                                    <TableCell className="font-mono">{v.code}</TableCell>
                                    <TableCell>{v.name}</TableCell>
                                    <TableCell>{v.tin ?? '—'}</TableCell>
                                    <TableCell><Badge variant={v.is_active ? 'default' : 'secondary'}>{v.is_active ? 'Yes' : 'No'}</Badge></TableCell>
                                    <TableCell className="space-x-2">
                                        <Button variant="ghost" size="sm" onClick={() => { setSelected(v); setEditOpen(true); }}>Edit</Button>
                                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { setSelected(v); setDeleteOpen(true); }}>Delete</Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableShell>
                <p className="text-muted-foreground text-sm">{vendors.length} of {totalVendors} (page {currentPage})</p>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Create vendor</DialogTitle></DialogHeader><VendorForm /></DialogContent></Dialog>
            <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent><DialogHeader><DialogTitle>Edit vendor</DialogTitle></DialogHeader>{selected && <VendorForm defaults={selected} />}</DialogContent></Dialog>
            <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete vendor" description={`Delete "${selected?.code}"?`} confirmLabel="Delete" variant="destructive" loading={deleting} onConfirm={() => {
                if (!selected) return;
                setDeleting(true);
                router.delete(`/libraries/vendors/${selected.id}`, { preserveScroll: true, onSuccess: () => { setDeleteOpen(false); setSelected(null); }, onFinish: () => setDeleting(false) });
            }} />
        </AppLayout>
    );
}
