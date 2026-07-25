import { Moon, Sun } from 'lucide-react';
import { useAppearance } from '@/hooks/use-appearance';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

export function AppearanceToggle() {
    const { resolvedAppearance, updateAppearance } = useAppearance();

    const isDark = resolvedAppearance === 'dark';

    const handleToggle = () => {
        updateAppearance(isDark ? 'light' : 'dark');
    };

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleToggle}
                        className="h-9 w-9 shrink-0"
                        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                        {isDark ? (
                            <Sun className="h-4 w-4" />
                        ) : (
                            <Moon className="h-4 w-4" />
                        )}
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                    {isDark ? 'Light mode' : 'Dark mode'}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
