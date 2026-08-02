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
  Table,
  Checkbox,
  NativeSelect,
  Dialog,
  Portal,
  VStack,
} from '@chakra-ui/react';
import { useApi } from '@/hooks/useApi';
import { type Project } from '@/lib/reports';
import UploadReportModal from '../components/UploadReportModal';
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
    // Data
    const [reports, setReports] = useState<Report[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const api = useApi();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Selected rows (checkboxes) for bulk delete
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    // Upload modal
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

    // Tab: Reports vs Schedule
    const [activeTab, setActiveTab] = useState<'reports' | 'schedule'>('reports');
    
    // Pagination (synced to URL query params)
    const [filters, setFilter] = useQueryParams({
        page: '',
    });
    const currentPage = parseInt(filters.page, 10) || 1;
    

    // Fetch reports
    async function fetchReports() {
        try {
        const json = await api.get<{ data: Report[] }>('/reports');
        setReports(json.data ?? []);
        } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load reports');
        } finally {
        setLoading(false);
        }
    }

    // Fetch projects (used to resolve project_id -> name if needed elsewhere)
    async function fetchProjects() {
        try {
        const json = await api.get<Project[]>('/projects');
        const list = Array.isArray(json) ? json : [];
        setProjects(list);
        if (list.length > 0) {
          setGenerateProjectId(String(list[0].project_id));
        }
        } catch {
        // Projects fetch failure is non-critical
        }
    }

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
    } = useGenerateReport({ onSuccess: fetchReports });
    

    useEffect(() => {
        fetchReports();
        fetchProjects();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(reports.length / ROWS_PER_PAGE));
    const paginatedData = reports.slice(
        (currentPage - 1) * ROWS_PER_PAGE,
        currentPage * ROWS_PER_PAGE,
    );

    // Selection helpers (scoped to the currently visible page of rows)
    const allSelected = paginatedData.length > 0 && paginatedData.every((r) => selectedIds.includes(r.report_id));
    const someSelected = paginatedData.some((r) => selectedIds.includes(r.report_id)) && !allSelected;

    function toggleAll() {
        if (allSelected) {
          setSelectedIds((prev) => prev.filter((id) => !paginatedData.some((r) => r.report_id === id)));
        } else {
          const pageIds = paginatedData.map((r) => r.report_id);
          setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
        }
    }

    function toggleOne(id: number) {
        setSelectedIds((prev) =>
          prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id],
        );
    }


    // Bulk delete handler
    // NOTE: DELETE /reports endpoint doesn't exist
    async function handleDeleteSelected() {
        console.log('Delete isn\'t available yet — no DELETE /reports endpoint exists on the backend.');
        /* await apiFetch('/reports', {
           token,
           method: 'DELETE',
           body: JSON.stringify({ ids: selectedIds }),
         });
         setSelectedIds([]);
         await fetchReports();
        */
    }

    function handleNewReport() {
        setIsUploadModalOpen(true);
    }

    
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
                    onClick={handleDeleteSelected}
                    disabled={selectedIds.length === 0}
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
     
              {/* Loading / Error */}
              {loading && <p>Loading reports...</p>}
              {error && <p style={{ color: 'var(--color-error-red)' }}>{error}</p>}
     
              {/* Reports tab content */}
              {!loading && !error && activeTab === 'reports' && (
                <Table.Root variant="outline" width="100%">
                  <Table.Header>
                    <Table.Row backgroundColor="var(--color-primary-800)">
                      <Table.ColumnHeader width="48px" paddingY="12px">
                        <Checkbox.Root
                          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                          onCheckedChange={toggleAll}
                        >
                          <Checkbox.HiddenInput />
                          <Checkbox.Control
                            borderRadius="md"
                            css={{
                                backgroundColor: 'var(--color-core-white)',
                                borderColor: 'var(--color-core-green)',
                                '&[data-state="checked"]': {
                                  backgroundColor: 'var(--color-primary-800)',
                                  borderColor: 'var(--color-core-green)',
                                },
                            }}
                          />
                        </Checkbox.Root>
                      </Table.ColumnHeader>
                      <Table.ColumnHeader color="var(--color-core-white)" fontWeight={600}>
                        Date Created
                      </Table.ColumnHeader>
                      <Table.ColumnHeader color="var(--color-core-white)" fontWeight={600}>
                        Report Name
                      </Table.ColumnHeader>
                      <Table.ColumnHeader color="var(--color-core-white)" fontWeight={600}>
                        Emails
                      </Table.ColumnHeader>
                      <Table.ColumnHeader color="var(--color-core-white)" fontWeight={600} textAlign="right">
                        Format
                      </Table.ColumnHeader>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {paginatedData.length === 0 && (
                      <Table.Row>
                        <Table.Cell colSpan={5} textAlign="center" paddingY="32px" color="var(--color-black-500)">
                          No reports found.
                        </Table.Cell>
                      </Table.Row>
                    )}
                    {paginatedData.map((report) => (
                      <Table.Row key={report.report_id}>
                        <Table.Cell>
                          <Checkbox.Root
                            checked={selectedIds.includes(report.report_id)}
                            onCheckedChange={() => toggleOne(report.report_id)}
                          >
                            <Checkbox.HiddenInput />
                            <Checkbox.Control
                                borderRadius="md"
                                css={{
                                    backgroundColor: 'var(--color-core-white)',
                                    borderColor: 'var(--color-core-green)',
                                    '&[data-state="checked"]': {
                                      backgroundColor: 'var(--color-primary-800)',
                                      borderColor: 'var(--color-core-green)',
                                    },
                                }}
                            />
                          </Checkbox.Root>
                        </Table.Cell>
                        <Table.Cell>{formatDate(report.date_created)}</Table.Cell>
                        <Table.Cell>{report.title || 'Untitled report'}</Table.Cell>
                        <Table.Cell>
                          {report.emails && report.emails.length > 0 ? report.emails.join(', ') : '—'}
                        </Table.Cell>
                        <Table.Cell textAlign="right">
                          {getFormatLabel(report.object_url)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
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
              onSuccess={() => { setIsUploadModalOpen(false); fetchReports(); }}
              token={token}
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
          </main>
        </div>
    );
}