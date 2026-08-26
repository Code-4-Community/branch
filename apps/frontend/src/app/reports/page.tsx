'use client';
import React, { useEffect, useState, Suspense } from 'react';
import { useQueryParams } from '@/hooks/useQueryParams';
import { useGenerateReport } from '@/hooks/useGenerateReport';
import NavBar from '../components/Navbar';
import Header from '../components/Header';
import Pagination from '../components/Pagination';
import {
  HStack,
  Button,
  NativeSelect,
  Dialog,
  Portal,
  VStack,
  Input,
} from '@chakra-ui/react';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import { useApi } from '@/hooks/useApi';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { projectsQuery, reportsPageQuery, reportsAllQuery } from '@/lib/queries';
import ExpenseFilterMenu, { type FilterGroup } from '../components/ExpenseFilterMenu';
import { type Project } from '@/lib/reports';
import UploadReportModal from '../components/UploadReportModal';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { FaPlus } from 'react-icons/fa';
import { LuSparkles } from "react-icons/lu";
import { LuEye, LuDownload } from 'react-icons/lu';
import { RiDeleteBack2Line } from "react-icons/ri";
import { IoClose } from "react-icons/io5";


type Report = {
    report_id: number;
    project_id: number;
    title: string;
    object_url: string;
    report_type: string;
    date_created: string | null;
    emails?: string[];
    file_size?: number | null;
};

const ROWS_PER_PAGE = 10;

const EXTENSION_LABELS: Record<string, string> = {
    pdf: 'PDF',
    docx: 'Word',
};

function getTypeBadgeStyle(reportType: string): React.CSSProperties {
  const isNarrative = reportType.toLowerCase() === 'narrative';
  return {
      display: 'inline-block',
      padding: '4px 12px',
      fontSize: '13px',
      fontWeight: 500,
      backgroundColor: isNarrative ? 'var(--color-primary-400)' : 'var(--color-primary-100)',
      color: isNarrative ? 'var(--color-core-green)' : 'var(--color-black-700)',
      textTransform: 'capitalize',
  };
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function getFormatLabel(objectUrl: string): string {
    const match = objectUrl.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
    const ext = match?.[1]?.toLowerCase();
    if (!ext) return '—';
    return EXTENSION_LABELS[ext] ?? ext.toUpperCase();
}

const FILE_TYPE_OPTIONS: { value: 'pdf' | 'docx'; label: string }[] = [
    { value: 'pdf', label: 'PDF' },
    { value: 'docx', label: 'Word (.docx)' },
];

const REPORT_TYPE_OPTIONS: { value: 'technical' | 'narrative'; label: string }[] = [
    { value: 'technical', label: 'Technical' },
    { value: 'narrative', label: 'Narrative' },
];

function formatDate(dateString: string | null): string {
    if (!dateString) return 'MM/DD/YYYY';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'MM/DD/YYYY';
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
}

export default function ReportsPage() {
    return (
      <Suspense>
        <ReportsPageContent />
      </Suspense>
    );
}

function ReportsPageContent() {
    const api = useApi();
    const queryClient = useQueryClient();

    // Delete/download failures — non-blocking, so they must not hide the table
    const [actionError, setActionError] = useState<string | null>(null);

    // Selected rows (checkboxes) for bulk delete
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [deleting, setDeleting] = useState(false);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

    // report_id whose download URL is currently being fetched
    const [downloadingId, setDownloadingId] = useState<number | null>(null);

    // Upload modal
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

    // search bar
    const [searchTerm, setSearchTerm] = useState('');

    // filter by
    const [selectedYears, setSelectedYears] = useState<string[]>([]);
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const TYPE_OPTIONS = ['Technical', 'Narrative'];

    const isFiltered = searchTerm.trim() !== '' || selectedYears.length > 0 || selectedTypes.length > 0;

    // preview modal
    const [previewReport, setPreviewReport] = useState<Report | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    // Pagination (synced to URL query params)
    const [filters, setFilter] = useQueryParams({
        page: '',
    });
    const currentPage = parseInt(filters.page, 10) || 1;

    // Already server-paginated before this change; now cached, and prefetched
    // for the page the URL asks for while /auth/me is still in flight.
    const reportsPaged = useQuery({
         ...reportsPageQuery(currentPage, ROWS_PER_PAGE),
         placeholderData: keepPreviousData,
         enabled: !isFiltered,
       });
      
       const reportsAll = useQuery({
         ...reportsAllQuery(),
       });
      
       // Real years present in the data, newest first — not a static guess.
       const YEAR_OPTIONS = React.useMemo(() => {
           const years = new Set<string>();
           for (const r of reportsAll.data ?? []) {
               if (r.date_created) {
                   years.add(new Date(r.date_created).getFullYear().toString());
               }
           }
           return Array.from(years).sort((a, b) => Number(b) - Number(a));
       }, [reportsAll.data]);
      
       // Client-side filtering only runs against the full list; the paged query is
       // already exactly what the server decided to return.
       const filteredReports: Report[] = React.useMemo(() => {
         if (!isFiltered) return [];
         const all = reportsAll.data ?? [];
         const q = searchTerm.trim().toLowerCase();
         return all.filter((r) => {
           if (q && !(r.title ?? '').toLowerCase().includes(q)) return false;
           if (selectedYears.length > 0) {
             const year = r.date_created ? new Date(r.date_created).getFullYear().toString() : '';
             if (!selectedYears.includes(year)) return false;
           }
           if (selectedTypes.length > 0) {
             if (!selectedTypes.some((t) => t.toLowerCase() === r.report_type.toLowerCase())) return false;
           }
           return true;
         });
       }, [isFiltered, reportsAll.data, searchTerm, selectedYears, selectedTypes]);
      
       const reports: Report[] = isFiltered
         ? filteredReports.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE)
         : reportsPaged.data?.data ?? [];
      
       const totalPages = isFiltered
         ? Math.max(1, Math.ceil(filteredReports.length / ROWS_PER_PAGE))
         : Math.max(1, reportsPaged.data?.pagination?.totalPages ?? 1);
      
       const loading = isFiltered ? reportsAll.isPending : reportsPaged.isPending;
      
       const activeQuery = isFiltered ? reportsAll : reportsPaged;
       const error = activeQuery.error
         ? activeQuery.error instanceof Error
           ? activeQuery.error.message
           : 'Failed to load reports'
         : null;

    // Same `['projects']` entry the navbar and every other page reads.
    const projectsList = useQuery(projectsQuery());
    const projects: Project[] = projectsList.data ?? [];

    const refetchReports = async () => {
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
    };

    const {
      showGenerateModal,
      setShowGenerateModal,
      generateProjectId,
      setGenerateProjectId,
      generateFileType,
      setGenerateFileType,
      generateReportName,
      setGenerateReportName,
      generateReportType,
      setGenerateReportType,
      generating,
      error: generateError,
      handleGenerate,
    } = useGenerateReport({ onSuccess: refetchReports });
    
    useEffect(() => {
        setFilter({ page: '' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, selectedYears, selectedTypes]);

    useEffect(() => {
        // Selection is scoped to the visible page, so it must not survive a page
        // change — bulk delete would otherwise remove rows the user can't see.
        setSelectedIds([]);
    }, [currentPage]);

    // Default the generate-report picker to the first project once the shared
    // projects query resolves. Was a side effect inside the old fetchProjects.
    // Only fills a blank selection, so a later refetch cannot silently move the
    // user's choice out from under them.
    const firstProjectId = projects[0]?.project_id;
    useEffect(() => {
        if (firstProjectId === undefined) return;
        setGenerateProjectId((current) => current || String(firstProjectId));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [firstProjectId]);

    // Selection helpers (scoped to the currently visible page of rows)
    const allSelected = reports.length > 0 && reports.every((r) => selectedIds.includes(r.report_id));
    const someSelected = reports.some((r) => selectedIds.includes(r.report_id)) && !allSelected;

    function toggleAll() {
        if (allSelected) {
          setSelectedIds((prev) => prev.filter((id) => !reports.some((r) => r.report_id === id)));
        } else {
          const pageIds = reports.map((r) => r.report_id);
          setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
        }
    }

    function toggleOne(id: number) {
        setSelectedIds((prev) =>
          prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id],
        );
    }


    // Bulk delete handler — the backend deletes one report per call
    async function handleDeleteSelected() {
        if (selectedIds.length === 0 || deleting) return;
        setDeleting(true);
        setActionError(null);
        try {
          const results = await Promise.allSettled(
            selectedIds.map((id) => api.del(`/reports/${id}`)),
          );
          const failed = results.filter((r) => r.status === 'rejected').length;
          // Keep whatever did fail selected so a retry does not re-issue the
          // deletes that already succeeded.
          setSelectedIds(
            selectedIds.filter((_, i) => results[i].status === 'rejected'),
          );
          await refetchReports();
          if (failed > 0) {
            throw new Error(
              `Failed to delete ${failed} of ${selectedIds.length} report${selectedIds.length === 1 ? '' : 's'}`,
            );
          }
        } finally {
          setDeleting(false);
        }
    }

    async function handlePreview(report: Report) {
        setPreviewReport(report);
        setPreviewUrl(null);
        setPreviewError(null);
        setPreviewLoading(true);
        try {
            const { downloadUrl } = await api.get<{ downloadUrl: string; expiresIn: number }>(
                `/reports/${report.report_id}/download`,
            );
            setPreviewUrl(downloadUrl);
        } catch (err) {
            setPreviewError(err instanceof Error ? err.message : 'Failed to load preview');
        } finally {
            setPreviewLoading(false);
        }
    }
    
    function closePreview() {
        setPreviewReport(null);
        setPreviewUrl(null);
        setPreviewError(null);
    }

    async function handleDownload(reportId: number) {
        setDownloadingId(reportId);
        setActionError(null);
        try {
          const { downloadUrl } = await api.get<{ downloadUrl: string; expiresIn: number }>(
            `/reports/${reportId}/download`,
          );
          window.open(downloadUrl, '_blank', 'noopener,noreferrer');
        } catch (err) {
          setActionError(err instanceof Error ? err.message : 'Failed to open report');
        } finally {
          setDownloadingId(null);
        }
    }

    function handleNewReport() {
        setIsUploadModalOpen(true);
    }

    const reportColumns: DataTableColumn<Report>[] = [
      {
          key: 'date',
          header: 'Date Created',
          width: '15%',
          cell: (report) => formatDate(report.date_created),
          skeleton: { width: '70%' },
      },
      {
          key: 'title',
          header: 'Report Name',
          width: '50%',
          cell: (report) => report.title || 'Untitled report',
      },
      {
          key: 'type',
          header: 'Type',
          width: '10%',
          cell: (report) => (
              <span style={getTypeBadgeStyle(report.report_type)}>
                  {report.report_type}
              </span>
          ),
      },
      {
          key: 'format',
          header: 'Format',
          width: '10%',
          cell: (report) => getFormatLabel(report.object_url),
          skeleton: { width: '45%' },
      },
      {
          key: 'size',
          header: 'Size',
          width: '10%',
          cell: (report) => formatFileSize(report.file_size),
          skeleton: { width: '40%' },
      },
      {
          key: 'actions',
          header: 'Actions',
          width: '10%',
          align: 'center' as const,
          cell: (report) => (
              <HStack gap="12px" justify="center">
                  <Button
                      variant="plain"
                      height="auto"
                      minWidth="auto"
                      padding="0"
                      color="var(--color-black-700)"
                      onClick={() => handlePreview(report)}
                      aria-label={`View ${report.title || 'report'}`}
                  >
                      <LuEye size={18} />
                  </Button>
                  <Button
                      variant="plain"
                      height="auto"
                      minWidth="auto"
                      padding="0"
                      color="var(--color-black-700)"
                      onClick={() => handleDownload(report.report_id)}
                      loading={downloadingId === report.report_id}
                      aria-label={`Download ${report.title || 'report'}`}
                  >
                      <LuDownload size={18} />
                  </Button>
              </HStack>
          ),
          skeleton: { width: '32px' },
      },
  ];

  const filterGroups: FilterGroup[] = [
    {
        key: 'year',
        label: 'Year',
        options: YEAR_OPTIONS.map((y) => ({ value: y, label: y })),
        selected: selectedYears,
        onChange: setSelectedYears,
    },
    {
        key: 'type',
        label: 'Type',
        options: TYPE_OPTIONS.map((t) => ({ value: t, label: t })),
        selected: selectedTypes,
        onChange: setSelectedTypes,
    },
];

    
    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <NavBar />
          <main style={{ flex: 1, backgroundColor: 'var(--color-core-white)' }}>
            <Header />
            <div style={{ margin: '2%', display: 'flex', flexDirection: 'column', minHeight: '85vh' }}>
              
     
              {/* Toolbar */}
              <HStack width="100%" justify="space-between" alignItems="center">
            <h1
              style={{
                fontWeight: 600,
                fontFamily: 'var(--font-heading)',
                fontSize: 'var(--font-size-heading-1)',
              }}
            >
              Reports
            </h1>
          </HStack>

          {/* Toolbar: search + actions */}
          <HStack width="100%" justify="space-between" paddingTop="24px" paddingBottom="32px">
            <HStack width="30%">
              <Input
                placeholder="🔍︎ Search..."
                variant="outline"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </HStack>

            <HStack></HStack>
                <HStack>
                  {/* Delete */}
                  <Button
                    backgroundColor="var(--color-error-red)"
                    color="var(--color-core-white)"
                    onClick={() => setConfirmDeleteOpen(true)}
                    loading={deleting}
                    disabled={selectedIds.length === 0 || deleting}
                  >
                    <RiDeleteBack2Line />
                    Delete {selectedIds.length} Selected
                  </Button>

                  {/* Filter */}
                  <ExpenseFilterMenu groups={filterGroups} />

                  {/* Generate */}
                  <Button
                    backgroundColor="var(--color-accent-light-green)"
                    color="var(--color-core-green)"
                    onClick={() => setShowGenerateModal(true)}
                  >
                    <LuSparkles />
                    Generate
                  </Button>
     
                  {/* Upload Report */}
                  <Button
                    backgroundColor="var(--color-core-green)"
                    color="var(--color-core-white)"
                    onClick={handleNewReport}
                  >
                    <FaPlus />
                    Upload Report
                  </Button>
                </HStack>
              </HStack>
     
              {error && <p style={{ color: 'var(--color-error-red)' }}>{error}</p>}
              {actionError && (
                <p style={{ color: 'var(--color-error-red)', paddingBottom: '12px' }}>{actionError}</p>
              )}
     
              {!error && (
                <DataTable
                  variant="outline"
                  columns={reportColumns}
                  rows={reports}
                  rowKey={(report) => report.report_id}
                  isLoading={loading}
                  loadingLabel="Loading reports…"
                  skeletonRows={ROWS_PER_PAGE}
                  emptyMessage="No reports found."
                  selection={{
                    label: 'Select all reports',
                    isSelected: (report) => selectedIds.includes(report.report_id),
                    onToggleRow: (report) => toggleOne(report.report_id),
                    allSelected,
                    someSelected,
                    onToggleAll: toggleAll,
                    disabled: loading,
                  }}
                />
              )}
     
              {!loading && !error && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={(p) => setFilter({ page: String(p) })}
                />
              )}
            </div>


            {/* Upload New Report modal */}
            <UploadReportModal
              open={isUploadModalOpen}
              onClose={() => setIsUploadModalOpen(false)}
              onSuccess={() => { setIsUploadModalOpen(false); void refetchReports(); }}
              projects={projects}
            />

            {/*Preview Modal*/}
            <Dialog.Root open={previewReport !== null} onOpenChange={(details) => { if (!details.open) closePreview(); }}>
                <Portal>
                    <Dialog.Backdrop />
                    <Dialog.Positioner>
                        <Dialog.Content maxWidth="800px">
                            <Dialog.Header
                                backgroundColor="var(--color-black-100)"
                                position="relative"
                                paddingRight="48px"
                            >
                                <Dialog.Title
                                    style={{
                                        fontFamily: 'var(--font-heading)',
                                        fontWeight: 600,
                                        fontSize: 'var(--font-size-heading-3)',
                                    }}
                                >
                                    {previewReport?.title || 'Untitled report'}
                                </Dialog.Title>
                                <Dialog.CloseTrigger asChild>
                                    <Button
                                        position="absolute"
                                        top="12px"
                                        right="12px"
                                        variant="ghost"
                                        size="lg"
                                        padding="4px"
                                        minWidth="auto"
                                    >
                                        <IoClose size={40} />
                                    </Button>
                                </Dialog.CloseTrigger>
                            </Dialog.Header>
                            <Dialog.Body>
                                {previewLoading && <p>Loading preview…</p>}
                                {previewError && (
                                    <p style={{ color: 'var(--color-error-red)' }}>{previewError}</p>
                                )}
                                {!previewLoading && !previewError && previewUrl && previewReport && (
                                    getFormatLabel(previewReport.object_url) === 'PDF' ? (
                                        <iframe
                                            src={previewUrl}
                                            title={previewReport.title || 'Report preview'}
                                            style={{ width: '100%', height: '600px', border: 'none' }}
                                        />
                                    ) : (
                                        <p style={{ color: 'var(--color-black-700)' }}>
                                            Preview isn&apos;t available for Word documents. Download the file to view it.
                                        </p>
                                    )
                                )}
                            </Dialog.Body>
                            <Dialog.Footer>
                                <Button variant="outline" onClick={closePreview}>Close</Button>
                                {previewReport && (
                                    <Button
                                        backgroundColor="var(--color-core-green)"
                                        color="var(--color-core-white)"
                                        onClick={() => handleDownload(previewReport.report_id)}
                                        loading={downloadingId === previewReport.report_id}
                                    >
                                        Download
                                    </Button>
                                )}
                            </Dialog.Footer>
                        </Dialog.Content>
                    </Dialog.Positioner>
                </Portal>
            </Dialog.Root>

            {/* Generate New Report modal — matches Figma */}
            <Dialog.Root
              open={showGenerateModal}
              onOpenChange={(details) => setShowGenerateModal(details.open)}
            >
              <Portal>
                <Dialog.Backdrop />
                <Dialog.Positioner>
                  <Dialog.Content>
                    <Dialog.Header
                        backgroundColor="var(--color-black-100)"
                        position="relative"
                        paddingRight="48px"
                    >
                        <Dialog.Title
                            style={{
                                fontFamily: 'var(--font-heading)',
                                fontWeight: 600,
                                fontSize: 'var(--font-size-heading-3)',
                            }}
                        >
                            Generate New Report
                        </Dialog.Title>

                        <Dialog.CloseTrigger asChild>
                            <Button
                            position="absolute"
                            top="12px"
                            right="12px"
                            variant="ghost"
                            size="lg"
                            padding="4px"
                            minWidth="auto"
                            >
                            <IoClose size={40} />
                            </Button>
                        </Dialog.CloseTrigger>

                    </Dialog.Header>
                    <Dialog.Body>
                      <VStack gap="16px" align="stretch">
                        <div>
                          <label style={{ fontWeight: 600, fontSize: '14px' }}>Report Name</label>
                          <Input
                            placeholder="Enter Report Name"
                            value={generateReportName}
                            onChange={(e) => setGenerateReportName(e.target.value)}
                          />
                        </div>

                        <div>
                          <label style={{ fontWeight: 600, fontSize: '14px' }}>Report Type</label>
                          <NativeSelect.Root>
                            <NativeSelect.Field
                              value={generateReportType}
                              onChange={(e) => setGenerateReportType(e.target.value as 'technical' | 'narrative')}
                            >
                              {REPORT_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </NativeSelect.Field>
                            <NativeSelect.Indicator />
                          </NativeSelect.Root>
                        </div>

                        <div>
                          <label style={{ fontWeight: 600, fontSize: '14px' }}>Project</label>
                          <NativeSelect.Root disabled={projects.length === 0}>
                            <NativeSelect.Field
                              value={generateProjectId}
                              onChange={(e) => setGenerateProjectId(e.target.value)}
                            >
                              {projects.length === 0 && <option value="">No projects available</option>}
                              {projects.map((p) => (
                                <option key={p.project_id} value={p.project_id}>
                                  {p.name}
                                </option>
                              ))}
                            </NativeSelect.Field>
                            <NativeSelect.Indicator />
                          </NativeSelect.Root>
                        </div>

                        <div>
                          <label style={{ fontWeight: 600, fontSize: '14px' }}>Format</label>
                          <NativeSelect.Root>
                            <NativeSelect.Field
                              value={generateFileType}
                              onChange={(e) => setGenerateFileType(e.target.value as 'pdf' | 'docx')}
                            >
                              {FILE_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </NativeSelect.Field>
                            <NativeSelect.Indicator />
                          </NativeSelect.Root>
                        </div>
                        {generateError && (
                          <p style={{ color: 'var(--color-error-red)', fontSize: '14px' }}>{generateError}</p>
                        )}
                      </VStack>
                    </Dialog.Body>
                    <Dialog.Footer>
                      <Button
                        variant="outline"
                        onClick={() => setShowGenerateModal(false)}
                        disabled={generating}
                      >
                        Cancel
                      </Button>
                      <Button
                        backgroundColor="var(--color-core-green)"
                        color="var(--color-core-white)"
                        onClick={handleGenerate}
                        loading={generating}
                        disabled={!generateProjectId || generating}
                      >
                        Generate
                      </Button>
                    </Dialog.Footer>
                  </Dialog.Content>
                </Dialog.Positioner>
              </Portal>
            </Dialog.Root>

            <ConfirmDeleteDialog
              open={confirmDeleteOpen}
              onClose={() => setConfirmDeleteOpen(false)}
              onConfirm={handleDeleteSelected}
              title="Delete Reports"
              itemName={`${selectedIds.length} report${selectedIds.length === 1 ? '' : 's'}`}
              confirmLabel="Delete"
              consequences={
                <p>
                  The generated files are deleted too, for everyone.
                </p>
              }
            />
          </main>
        </div>
    );
}