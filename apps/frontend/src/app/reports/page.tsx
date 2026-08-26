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
} from '@chakra-ui/react';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import { useApi } from '@/hooks/useApi';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { projectsQuery, reportsPageQuery } from '@/lib/queries';
import { type Project } from '@/lib/reports';
import UploadReportModal from '../components/UploadReportModal';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { FaPlus } from 'react-icons/fa';
import { LuClipboardPenLine } from 'react-icons/lu';
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
};

const ROWS_PER_PAGE = 10;

const EXTENSION_LABELS: Record<string, string> = {
    pdf: 'PDF',
    docx: 'Word',
};

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

    // Tab: Reports vs Schedule
    const [activeTab, setActiveTab] = useState<'reports' | 'schedule'>('reports');
    
    // Pagination (synced to URL query params)
    const [filters, setFilter] = useQueryParams({
        page: '',
    });
    const currentPage = parseInt(filters.page, 10) || 1;

    // Already server-paginated before this change; now cached, and prefetched
    // for the page the URL asks for while /auth/me is still in flight.
    const reportsList = useQuery({
      ...reportsPageQuery(currentPage, ROWS_PER_PAGE),
      // Page flips reuse the previous page's rows instead of unmounting the
      // table into a skeleton.
      placeholderData: keepPreviousData,
    });

    const reports: Report[] = reportsList.data?.data ?? [];
    const totalPages = Math.max(1, reportsList.data?.pagination?.totalPages ?? 1);
    const loading = reportsList.isPending;
    const error = reportsList.error
      ? reportsList.error instanceof Error
        ? reportsList.error.message
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
      generating,
      error: generateError,
      handleGenerate,
    } = useGenerateReport({ onSuccess: refetchReports });
    

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
            width: '18%',
            cell: (report) => formatDate(report.date_created),
            skeleton: { width: '70%' },
        },
        {
            key: 'title',
            header: 'Report Name',
            width: '32%',
            cell: (report) => (
                <Button
                    variant="plain"
                    height="auto"
                    minWidth="auto"
                    padding="0"
                    color="var(--color-core-green)"
                    textDecoration="underline"
                    onClick={() => handleDownload(report.report_id)}
                    loading={downloadingId === report.report_id}
                    loadingText={report.title || 'Untitled report'}
                >
                    {report.title || 'Untitled report'}
                </Button>
            ),
        },
        {
            key: 'emails',
            header: 'Emails',
            width: '35%',
            cell: (report) =>
                report.emails && report.emails.length > 0 ? report.emails.join(', ') : '—',
            skeleton: { width: '85%' },
        },
        {
            key: 'format',
            header: 'Format',
            width: '15%',
            align: 'right',
            cell: (report) => getFormatLabel(report.object_url),
            skeleton: { width: '45%' },
        },
    ];

    
    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <NavBar />
          <main style={{ flex: 1, backgroundColor: 'var(--color-core-white)' }}>
            <Header />
            <div style={{ margin: '2%', display: 'flex', flexDirection: 'column', minHeight: '85vh' }}>
              <h1
                style={{
                  fontWeight: 600,
                  fontFamily: 'var(--font-heading)',
                  fontSize: 'var(--font-size-heading-1)',
                }}
              >
                Reports
              </h1>
     
              {/* Tabs + Toolbar */}
              <HStack width="100%" justify="space-between" paddingTop="32px" paddingBottom="32px">
                <HStack>
                  <Button
                    backgroundColor={activeTab === 'reports' ? 'var(--color-core-black)' : 'var(--color-core-white)'}
                    color={activeTab === 'reports' ? 'var(--color-core-white)' : 'var(--color-core-black)'}
                    border="1px solid"
                    borderColor="var(--color-black-500)"
                    onClick={() => setActiveTab('reports')}
                  >
                    Reports
                  </Button>
                  <Button
                    backgroundColor={activeTab === 'schedule' ? 'var(--color-core-black)' : 'var(--color-core-white)'}
                    color={activeTab === 'schedule' ? 'var(--color-core-white)' : 'var(--color-core-black)'}
                    border="1px solid"
                    borderColor="var(--color-black-500)"
                    onClick={() => setActiveTab('schedule')}
                  >
                    Schedule
                  </Button>
                </HStack>
     
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
                    Delete
                  </Button>

                  {/* Generate */}
                  <Button
                    backgroundColor="var(--color-core-white)"
                    color="var(--color-core-black)"
                    border="1px solid"
                    borderColor="var(--color-black-500)"
                    onClick={() => setShowGenerateModal(true)}
                  >
                    <LuClipboardPenLine />
                    Generate
                  </Button>
     
                  {/* + New Report */}
                  <Button
                    backgroundColor="var(--color-core-green)"
                    color="var(--color-core-white)"
                    onClick={handleNewReport}
                  >
                    <FaPlus />
                    New Report
                  </Button>
                </HStack>
              </HStack>
     
              {error && <p style={{ color: 'var(--color-error-red)' }}>{error}</p>}
              {actionError && (
                <p style={{ color: 'var(--color-error-red)', paddingBottom: '12px' }}>{actionError}</p>
              )}
     
              {/* Reports tab content */}
              {!error && activeTab === 'reports' && (
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
     
              {/* Schedule tab content */}
              {!loading && !error && activeTab === 'schedule' && (
                <p style={{ color: 'var(--color-black-500)' }}>
                  Schedule view not yet implemented.
                </p>
              )}
     
              {/* Pagination */}
              {!loading && !error && activeTab === 'reports' && (
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