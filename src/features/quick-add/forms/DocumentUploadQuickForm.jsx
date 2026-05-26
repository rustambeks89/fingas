// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: In-place document upload — file + bucket. Writes to Storage + documents table.

import { useRef, useState } from 'react';
import { Check, Upload } from 'lucide-react';
import { Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { uploadDocument } from '@/services/documentService';
import { useAuth } from '@/hooks/useAuth';

const BUCKETS = [
  { id: 'documents',     label: 'Общие документы' },
  { id: 'receipts',      label: 'Чеки' },
  { id: 'invoices',      label: 'Накладные' },
  { id: 'tax-documents', label: 'Налоговые' },
  { id: 'measurements',  label: 'Замеры' },
  { id: 'shift-reports', label: 'Z-отчёты' },
];

export function DocumentUploadQuickForm({ onDone, onCancel }) {
  const { user } = useAuth();
  const orgId = user?.profile?.organization_id;
  const stationId = user?.profile?.station_id;
  const fileRef = useRef(null);

  const [bucket, setBucket] = useState('documents');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e?.preventDefault?.();
    setErr('');
    if (!file) { setErr('Выберите файл'); return; }
    setSaving(true);
    try {
      await uploadDocument({
        bucket, file,
        organizationId: orgId,
        stationId,
        documentType: bucket,
        uploadedBy: user?.id,
      });
      onDone?.();
    } catch (e2) {
      setErr(e2?.message ?? 'Не удалось загрузить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Select label="Категория" value={bucket} onChange={(e) => setBucket(e.target.value)}>
        {BUCKETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
      </Select>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="w-full rounded-2xl border-2 border-dashed border-line bg-bg-elevated px-4 py-8 hover:border-brand-500/40 transition-colors flex flex-col items-center gap-2"
      >
        <Upload className="w-6 h-6 text-ink-muted" />
        <div className="text-sm text-ink-muted text-center">
          {file ? <span className="text-ink font-medium break-all">{file.name}</span> : 'Выберите файл'}
        </div>
        {file && (
          <div className="text-[11px] text-ink-soft">{Math.round(file.size / 1024)} КБ</div>
        )}
      </button>

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      {err && (
        <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-2xl px-4 py-2.5">{err}</div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Назад</Button>
        <Button type="submit" variant="success" loading={saving} disabled={!file}>
          <Check className="w-4 h-4" /> Загрузить
        </Button>
      </div>
    </form>
  );
}
