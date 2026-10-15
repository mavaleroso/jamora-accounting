import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Underline, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Styles for rich text HTML, in the editor and wherever the saved HTML is shown. */
export const richTextClass =
    'text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-0 [&_p+p]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_li>p]:my-0 [&_ul]:my-1 [&_ol]:my-1';

type Props = {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
    className?: string;
    /** Classes for the editable area, e.g. its height. */
    contentClassName?: string;
};

/**
 * Small rich text field: bold, italic, underline and lists. Emits HTML ('' when empty); the server
 * sanitizes it to the same tags before saving.
 */
export function RichTextEditor({ value, onChange, placeholder, autoFocus, className, contentClassName }: Props) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: false,
                blockquote: false,
                code: false,
                codeBlock: false,
                horizontalRule: false,
                strike: false,
                link: false,
            }),
        ],
        content: value,
        autofocus: autoFocus ? 'end' : false,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: cn('min-h-24 px-3 py-2 outline-none', richTextClass, contentClassName),
            },
        },
        onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
    });

    return (
        <div
            className={cn(
                'rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30',
                className,
            )}
        >
            {editor && <Toolbar editor={editor} />}
            <div className="relative">
                {editor?.isEmpty && placeholder && <p className="pointer-events-none absolute top-2 left-3 text-sm text-muted-foreground">{placeholder}</p>}
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}

function Toolbar({ editor }: { editor: Editor }) {
    const state = useEditorState({
        editor,
        selector: ({ editor: e }) => ({
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            bulletList: e.isActive('bulletList'),
            orderedList: e.isActive('orderedList'),
        }),
    });

    const buttons: { key: keyof typeof state; label: string; icon: LucideIcon; run: () => void }[] = [
        { key: 'bold', label: 'Bold', icon: Bold, run: () => editor.chain().focus().toggleBold().run() },
        { key: 'italic', label: 'Italic', icon: Italic, run: () => editor.chain().focus().toggleItalic().run() },
        { key: 'underline', label: 'Underline', icon: Underline, run: () => editor.chain().focus().toggleUnderline().run() },
        { key: 'bulletList', label: 'Bulleted list', icon: List, run: () => editor.chain().focus().toggleBulletList().run() },
        { key: 'orderedList', label: 'Numbered list', icon: ListOrdered, run: () => editor.chain().focus().toggleOrderedList().run() },
    ];

    return (
        <div className="flex gap-0.5 border-b px-1.5 py-1">
            {buttons.map((b) => (
                <button
                    key={b.key}
                    type="button"
                    title={b.label}
                    aria-label={b.label}
                    aria-pressed={state[b.key]}
                    onClick={b.run}
                    className={cn(
                        'inline-flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                        state[b.key] && 'bg-muted text-foreground',
                    )}
                >
                    <b.icon className="size-3.5" />
                </button>
            ))}
        </div>
    );
}
