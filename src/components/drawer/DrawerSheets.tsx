import { useState } from 'react';
import { Filter, Folder as FolderIcon, List, Trash2 } from 'lucide-react';
import type { Folder } from '../../types/task';
import type { SmartListId } from '../../prefs/prefs';
import { SMART_LIST_IDS, SMART_LIST_LABELS } from '../../prefs/prefs';
import { Sheet, Switch } from '../ui/Sheet';
import { SmartListIcon } from './SmartListIcon';

/** "Manage smart lists": show / hide toggles, persisted in prefs. */
export function ManageSmartListsSheet({
  open,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  value: Record<SmartListId, boolean>;
  onChange: (next: Record<SmartListId, boolean>) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Smart Lists"
      testId="manage-smart-lists"
      action={
        <button type="button" onClick={onClose} className="text-[15px] font-semibold text-tt-blue px-1">
          Done
        </button>
      }
    >
      <p className="px-5 pb-2 text-[13px] text-tt-secondary">Choose which smart lists appear in the menu.</p>
      <ul className="px-2">
        {SMART_LIST_IDS.map((id) => (
          <li key={id} className="flex items-center gap-4 px-3 h-[52px]">
            <span className="rounded-[5px] bg-tt-drawer p-[3px] flex">
              <SmartListIcon id={id} size={18} />
            </span>
            <span className="flex-1 text-[16px]">{SMART_LIST_LABELS[id]}</span>
            <Switch
              checked={value[id]}
              label={`Show ${SMART_LIST_LABELS[id]}`}
              onChange={(next) => onChange({ ...value, [id]: next })}
            />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

type AddMode = 'menu' | 'list' | 'folder';

/** Drawer "+ Add": new list (optionally in a folder), new folder, or new filter. */
export function AddListSheet({
  open,
  folders,
  onClose,
  onCreateList,
  onCreateFolder,
  onNewFilter,
}: {
  open: boolean;
  folders: Folder[];
  onClose: () => void;
  onCreateList: (name: string, folderId: string | null) => void;
  onCreateFolder: (name: string) => void;
  onNewFilter: () => void;
}) {
  const [mode, setMode] = useState<AddMode>('menu');
  const [name, setName] = useState('');
  const [folderId, setFolderId] = useState('');
  const close = () => {
    setMode('menu');
    setName('');
    setFolderId('');
    onClose();
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (mode === 'list') onCreateList(n, folderId || null);
    else onCreateFolder(n);
    close();
  };
  const option = (Icon: typeof List, label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-4 px-5 h-[52px] text-[16px] hover:bg-tt-hover">
      <Icon className="w-5 h-5 text-tt-blue" />
      {label}
    </button>
  );
  return (
    <Sheet open={open} onClose={close} title={mode === 'menu' ? 'Add' : mode === 'list' ? 'New List' : 'New Folder'}>
      {mode === 'menu' ? (
        <div className="pb-1">
          {option(List, 'List', () => setMode('list'))}
          {option(FolderIcon, 'Folder', () => setMode('folder'))}
          {option(Filter, 'Filter', () => {
            close();
            onNewFilter();
          })}
        </div>
      ) : (
        <form onSubmit={submit} className="px-5 pb-2 space-y-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={mode === 'list' ? 'List name' : 'Folder name'}
            aria-label={mode === 'list' ? 'List name' : 'Folder name'}
            className="w-full px-3 py-2.5 rounded-xl bg-tt-input text-[15px] outline-none focus:ring-1 focus:ring-tt-blue"
          />
          {mode === 'list' && folders.length > 0 && (
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              aria-label="Folder"
              className="w-full px-3 py-2.5 rounded-xl bg-tt-input text-[15px] outline-none"
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMode('menu')} className="px-4 py-2 rounded-lg text-[14px] text-tt-secondary">
              Back
            </button>
            <button type="submit" disabled={!name.trim()} className="px-4 py-2 rounded-lg text-[14px] font-semibold bg-tt-blue text-white disabled:opacity-40">
              Add
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

/** Long-press on a drawer list / folder row. */
export function ItemActionSheet({
  target,
  onClose,
  onDelete,
}: {
  target: { kind: 'list' | 'folder'; name: string } | null;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <Sheet open={!!target} onClose={onClose} title={target?.name}>
      <button
        type="button"
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="w-full flex items-center gap-4 px-5 h-[52px] text-[16px] text-tt-overdue hover:bg-tt-hover"
      >
        <Trash2 className="w-5 h-5" />
        Delete {target?.kind === 'folder' ? 'folder' : 'list'}
      </button>
      {target?.kind === 'list' && (
        <p className="px-5 pb-2 text-[12px] text-tt-secondary">Tasks in a deleted list move to Inbox.</p>
      )}
    </Sheet>
  );
}
