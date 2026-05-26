// [UPDATED BY CLAUDE CLI - 2026-05-25]
// [UPDATED BY CODEX - 2026-05-25]
// Project: Fingas
// Purpose: Documents list + upload into Storage. Buckets:
//   receipts | invoices | tax-documents | measurements | shift-reports | documents

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, FolderOpen, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { FormSheet } from '@/components/bottom-sheets/FormSheet';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/status/EmptyState';
import { deleteDocument, listDocuments, updateDocument, uploadDocument } from '@/services/documentService';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { MODULES } from '@/lib/constants';
import { formatRelative } from '@/lib/formatters';

const BUCKETS = [
  { id: 'documents',     label: 'Общие' },
  { id: 'receipts',      label: 'Чеки' },
  { id: 'invoices',      label: 'Накладные' },
  { id: 'tax-documents', label: 'Налоги' },
  { id: 'measurements',  label: 'Замеры' },
  { id: 'shift-reports', label: 'Z-отчёты' },
];

export default function DocumentsScreen() {
  const { user } = useAuth();
  const { canUpload, canEdit, canDelete } = usePermissions();
  const orgId = user?.profile?.organization_id;
  const stationId = user?.profile?.station_id;
  const fileRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [bucket, setBucket] = useState('documents');
  const [uploading, setUploading] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [docForm, setDocForm] = useState({ document_type: '', file_name: '', related_table: '', related_id: '' });
  const [docSaving, setDocSaving] = useState(false);
  const [docDeleting, setDocDeleting] = useState(false);
  const [docError, setDocError] = useState('');
  const [err, setErr] = useState('');

  const counts = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc.byBucket[row.document_type ?? 'documents'] =
          (acc.byBucket[row.document_type ?? 'documents'] ?? 0) + 1;
        return acc;
      },
      { total: 0, byBucket: {} },
    );
  }, [rows]);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await listDocuments({
        organizationId: orgId,
        documentType: filter || undefined,
      });
      setRows(data);
    } catch (e) {
      setErr(e?.message ?? 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [orgId, filter]);

  useEffect(() => { reload(); }, [reload]);

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr('');
    try {
      await uploadDocument({
        bucket,
        file,
        organizationId: orgId,
        stationId,
        documentType: bucket,
        uploadedBy: user?.id,
      });
      await reload();
    } catch (er) {
      setErr(er?.message ?? 'Не удалось загрузить');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function openEditDoc(doc) {
    setEditingDoc(doc);
    setDocForm({
      document_type: doc.document_type ?? 'documents',
      file_name: doc.file_name ?? '',
      related_table: doc.related_table ?? '',
      related_id: doc.related_id ?? '',
    });
    setDocError('');
  }

  async function submitDocEdit() {
    if (!editingDoc) return;
    setDocSaving(true);
    setDocError('');
    try {
      await updateDocument(editingDoc.id, {
        document_type: docForm.document_type || 'documents',
        file_name: docForm.file_name || null,
        related_table: docForm.related_table || null,
        related_id: docForm.related_id || null,
      });
      setEditingDoc(null);
      await reload();
    } catch (e) {
      setDocError(e?.message ?? 'Не удалось сохранить документ.');
    } finally {
      setDocSaving(false);
    }
  }

  async function removeDoc() {
    if (!editingDoc) return;
    if (!confirm(`Удалить запись документа «${editingDoc.file_name || editingDoc.document_type || 'файл'}»?`)) return;
    setDocDeleting(true);
    setDocError('');
    try {
      await deleteDocument(editingDoc.id);
      setEditingDoc(null);
      await reload();
    } catch (e) {
      setDocError(e?.message ?? 'Не удалось удалить запись.');
    } finally {
      setDocDeleting(false);
    }
  }

  async function removeDocQuick(doc) {
    if (!confirm(`Удалить запись документа «${doc.file_name || doc.document_type || 'файл'}»?`)) return;
    setDocDeleting(true);
    setDocError('');
    try {
      await deleteDocument(doc.id);
      await reload();
    } catch (e) {
      setDocError(e?.message ?? 'Не удалось удалить запись.');
    } finally {
      setDocDeleting(false);
    }
  }

  return (
    <div>
      <ScreenHeader title="Документы" subtitle="Storage + регистр в documents" />

      {!loading && rows.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl p-3.5 mb-3 border border-brand-500/20 bg-bg-card shadow-sm"
        >
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-500/5 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-soft font-bold">
              <FolderOpen className="w-3 h-3 text-brand-500" />
              Архив файлов
            </div>
            <div className="mt-1 text-xl font-bold text-ink">{counts.total}</div>
            <div className="mt-0.5 text-xs text-ink-muted">Документов в общем реестре</div>
            <div className="grid grid-cols-2 gap-2 mt-2.5">
              <SummaryCard label="Категорий" value={Object.keys(counts.byBucket).length} />
              <SummaryCard label="Накладные" value={counts.byBucket.invoices ?? 0} />
            </div>
          </div>
        </motion.div>
      )}

      {/* upload row */}
      {canUpload(MODULES.DOCUMENTS) && (
        <Card hoverable className="!p-3 rounded-xl border border-line/30 bg-bg-card shadow-sm mb-2.5">
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <Select label="Категория для загрузки" value={bucket} onChange={(e) => setBucket(e.target.value)} className="!h-9 text-xs">
              {BUCKETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </Select>
            <Button onClick={() => fileRef.current?.click()} loading={uploading} className="h-9 text-xs">
              <Upload className="w-3.5 h-3.5" /> Загрузить
            </Button>
          </div>
          <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
        </Card>
      )}

      {/* filter chips */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1.5 -mx-4 px-4">
        <Chip active={filter === ''} onClick={() => setFilter('')}>Все</Chip>
        {BUCKETS.map((b) => (
          <Chip key={b.id} active={filter === b.id} onClick={() => setFilter(b.id)}>{b.label}</Chip>
        ))}
      </div>

      {err && <Card className="text-sm text-danger mt-2">{err}</Card>}

      {loading && (
        <div className="space-y-2 mt-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-bg-card border border-line/30 animate-pulse" />)}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <EmptyState
          icon={FileText}
          title="Документов пока нет"
          description={canUpload(MODULES.DOCUMENTS) ? 'Загрузите первый файл — чек, накладную, квитанцию.' : 'У вас нет прав на загрузку. Документы появятся, когда их добавит другой сотрудник.'}
          action={canUpload(MODULES.DOCUMENTS) ? (
            <Button onClick={() => fileRef.current?.click()}><Plus className="w-4 h-4" /> Загрузить</Button>
          ) : null}
        />
      )}

      <div className="space-y-2 mt-3">
        {!loading && rows.map((d, i) => (
          <motion.div key={d.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
            <Card hoverable className="p-5">
              <div className="flex items-start gap-4">
                <a href={d.file_url} target="_blank" rel="noreferrer" className="w-12 h-12 rounded-2xl bg-brand-500/12 border border-brand-500/25 text-brand-500 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5" />
                </a>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">
                        {d.document_type}
                      </div>
                      <div className="font-semibold text-ink mt-1 truncate">
                        {d.file_name || 'Файл'}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[11px] text-ink-soft">Загружен</div>
                      <div className="text-sm font-semibold text-ink">{formatRelative(d.created_at)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge tone="brand">{bucketLabel(d.document_type)}</Badge>
                    <Badge tone="default">Storage</Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {canEdit(MODULES.DOCUMENTS) && (
                      <Button size="sm" variant="secondary" onClick={() => openEditDoc(d)}>
                        <Pencil className="w-4 h-4" /> Изменить
                      </Button>
                    )}
                    {canDelete(MODULES.DOCUMENTS) && (
                      <Button size="sm" variant="danger" onClick={() => removeDocQuick(d)}>
                        <Trash2 className="w-4 h-4" /> Удалить
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <FormSheet
        open={!!editingDoc}
        onClose={() => setEditingDoc(null)}
        title="Редактировать документ"
        onSubmit={submitDocEdit}
        saving={docSaving}
        error={docError}
        onDelete={canDelete(MODULES.DOCUMENTS) ? removeDoc : null}
        deleting={docDeleting}
      >
        <Select
          label="Категория"
          value={docForm.document_type}
          onChange={(e) => setDocForm((c) => ({ ...c, document_type: e.target.value }))}
        >
          {BUCKETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </Select>
        <Input
          label="Имя файла"
          value={docForm.file_name}
          onChange={(e) => setDocForm((c) => ({ ...c, file_name: e.target.value }))}
        />
        <Input
          label="Связанная таблица"
          value={docForm.related_table}
          onChange={(e) => setDocForm((c) => ({ ...c, related_table: e.target.value }))}
        />
        <Input
          label="Связанный ID"
          value={docForm.related_id}
          onChange={(e) => setDocForm((c) => ({ ...c, related_id: e.target.value }))}
        />
      </FormSheet>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={
        'flex-shrink-0 px-3 h-8 rounded-xl text-xs font-semibold border transition-colors ' +
        (active
          ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
          : 'bg-bg-card text-ink-muted border-line/40 hover:text-ink')
      }
    >
      {children}
    </button>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-xl bg-bg-card/70 border border-white/5 p-2.5 backdrop-blur-xl">
      <div className="text-[9px] uppercase tracking-[0.18em] text-ink-soft font-bold">{label}</div>
      <div className="text-xs font-bold text-ink mt-0.5">{value}</div>
    </div>
  );
}

function bucketLabel(id) {
  return BUCKETS.find((b) => b.id === id)?.label ?? id;
}
