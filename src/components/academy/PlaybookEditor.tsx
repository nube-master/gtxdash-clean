import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Youtube from "@tiptap/extension-youtube";
import {
  Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare, Quote, Minus, Link as LinkIcon,
  Image as ImageIcon, Video, Table as TableIcon, Code2, Undo, Redo,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface PlaybookEditorProps {
  content: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  placeholder?: string;
}

export function PlaybookEditor({ content, onChange, editable = true, placeholder = "Comece a escrever..." }: PlaybookEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: "rounded-lg bg-muted/40 p-4 font-mono text-xs border border-border/20" } },
        blockquote: { HTMLAttributes: { class: "border-l-4 border-primary/30 pl-4 italic text-muted-foreground" } },
      }),
      TaskList.configure({ HTMLAttributes: { class: "not-prose" } }),
      TaskItem.configure({ nested: true, HTMLAttributes: { class: "flex items-start gap-2" } }),
      Table.configure({ resizable: true, HTMLAttributes: { class: "border-collapse w-full" } }),
      TableRow,
      TableCell.configure({ HTMLAttributes: { class: "border border-border/30 px-3 py-2 text-xs" } }),
      TableHeader.configure({ HTMLAttributes: { class: "border border-border/30 px-3 py-2 text-xs font-semibold bg-muted/30" } }),
      Link.configure({ openOnClick: !editable, HTMLAttributes: { class: "text-primary underline cursor-pointer" } }),
      Image.configure({ HTMLAttributes: { class: "rounded-lg max-w-full my-4 border border-border/20" } }),
      Youtube.configure({ HTMLAttributes: { class: "rounded-lg my-4 w-full aspect-video" }, width: 0, height: 0 }),
      Placeholder.configure({ placeholder }),
    ],
    content: content || "",
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[200px] px-4 py-3",
          "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0",
          "[&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-start [&_ul[data-type=taskList]_li]:gap-2",
          "[&_ul[data-type=taskList]_li_label]:mt-0.5",
          "[&_table]:border-collapse [&_table]:w-full [&_table]:my-4",
        ),
      },
    },
  });

  // Sync content when it changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(content || "");
    }
  }, [content, editor]);

  if (!editor) return null;

  if (!editable) {
    return (
      <div className="rounded-lg border border-border/20 bg-muted/10">
        <EditorContent editor={editor} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/30 bg-card/50 overflow-hidden">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({ icon: Icon, active, onClick, title }: { icon: any; active?: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "h-7 w-7 rounded flex items-center justify-center transition-colors",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent/10"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function LinkButton({ editor }: { editor: any }) {
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);

  const handleSetLink = () => {
    if (url) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setOpen(false);
    setUrl("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn("h-7 w-7 rounded flex items-center justify-center transition-colors", editor.isActive("link") ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent/10")}>
          <LinkIcon className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="flex gap-1.5">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="text-xs h-8" onKeyDown={(e) => e.key === "Enter" && handleSetLink()} />
          <Button size="sm" className="h-8 text-xs px-3" onClick={handleSetLink}>OK</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Toolbar({ editor }: { editor: any }) {
  const addImage = useCallback(() => {
    const url = window.prompt("URL da imagem:");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  const addVideo = useCallback(() => {
    const url = window.prompt("URL do vídeo (YouTube):");
    if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run();
  }, [editor]);

  const addTable = useCallback(() => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  return (
    <div className="flex items-center gap-0.5 p-1.5 border-b border-border/30 bg-muted/10 flex-wrap">
      <ToolbarButton icon={Undo} onClick={() => editor.chain().focus().undo().run()} title="Desfazer" />
      <ToolbarButton icon={Redo} onClick={() => editor.chain().focus().redo().run()} title="Refazer" />
      <Separator orientation="vertical" className="h-5 mx-1" />
      <ToolbarButton icon={Heading1} active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Título 1" />
      <ToolbarButton icon={Heading2} active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Título 2" />
      <ToolbarButton icon={Heading3} active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Título 3" />
      <Separator orientation="vertical" className="h-5 mx-1" />
      <ToolbarButton icon={Bold} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrito" />
      <ToolbarButton icon={Italic} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Itálico" />
      <ToolbarButton icon={Strikethrough} active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Tachado" />
      <ToolbarButton icon={Code} active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} title="Código inline" />
      <Separator orientation="vertical" className="h-5 mx-1" />
      <ToolbarButton icon={List} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista" />
      <ToolbarButton icon={ListOrdered} active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada" />
      <ToolbarButton icon={CheckSquare} active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Checklist" />
      <ToolbarButton icon={Quote} active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Citação" />
      <Separator orientation="vertical" className="h-5 mx-1" />
      <ToolbarButton icon={Code2} active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Bloco de código" />
      <ToolbarButton icon={Minus} onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Linha horizontal" />
      <ToolbarButton icon={TableIcon} onClick={addTable} title="Tabela" />
      <ToolbarButton icon={ImageIcon} onClick={addImage} title="Imagem" />
      <ToolbarButton icon={Video} onClick={addVideo} title="Vídeo" />
      <LinkButton editor={editor} />
    </div>
  );
}
