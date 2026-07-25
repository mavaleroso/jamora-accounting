import AuthLayoutTemplate from '@/layouts/auth/auth-simple-layout';
import { useFlashToast } from '@/hooks/use-flash-toast';

export default function AuthLayout({
    children,
    title,
    description,
    ...props
}: {
    children: React.ReactNode;
    title: string;
    description: string;
}) {
    useFlashToast();
    return (
        <AuthLayoutTemplate title={title} description={description} {...props}>
            {children}
        </AuthLayoutTemplate>
    );
}
