import React from 'react';
import { LuDollarSign } from 'react-icons/lu';
import { RxPeople } from 'react-icons/rx';
import { FaArrowRight } from 'react-icons/fa6';
import { formatCurrency } from '@/lib/format';

type ActiveProps = {
    variant: 'active';
    name: string;
    total_budget: number;
    budget_used: number;
    members: number;
};

type ArchiveProps = {
    variant: 'archive';
    name: string;
    total_budget: number;
    members: number;
    start_date: string;
    end_date: string;
};

// `fullWidth` hands sizing to the parent: the responsive widths below are tuned
// for the projects list and would shrink inside a grid cell.
type ProjectCardProps = (ActiveProps | ArchiveProps) & { fullWidth?: boolean };

/** `$ Budget` / `people Staff` — the two stat columns split by a rule. */
function StatColumn({
    icon,
    label,
    value,
    grow = false,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    /** Only the Staff column flexes; Budget keeps its natural width so a figure
     *  like "$52,500/ $100,000" is never ellipsised in favour of "3 members". */
    grow?: boolean;
}) {
    return (
        <div className={`flex min-w-0 flex-col !gap-2 ${grow ? 'flex-1' : 'shrink'}`}>
            <div className="flex flex-row items-center !gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center text-core-black [&>svg]:h-full [&>svg]:w-full">
                    {icon}
                </span>
                <h5>{label}</h5>
            </div>
            <p className="truncate">{value}</p>
        </div>
    );
}

export default function ProjectCard(props: ProjectCardProps) {
    const widthClasses = props.fullWidth
        ? 'w-full'
        : 'w-full sm:w-[50%] md:w-[35%] lg:w-[25%]';

    return (
        // A container, not a viewport breakpoint: how much room the stats have
        // depends on the card's own width, which varies with the grid track.
        <div
            className={`@container flex h-full flex-col !gap-4 rounded-[4px] !border-[1px] !border-solid !border-black-300 !bg-core-white !p-4 ${widthClasses}`}
        >
            {/* Two lines then ellipsis: the design's cards are a fixed height and a
                long project name would otherwise push the stats out of alignment
                across a row. */}
            <h4 className="line-clamp-2 break-words">{props.name}</h4>

            <div className="flex min-w-0 flex-row items-center !gap-4 @max-[240px]:flex-col @max-[240px]:!gap-2">
                <StatColumn
                    icon={<LuDollarSign aria-hidden />}
                    label="Budget"
                    value={
                        props.variant === 'active'
                            ? `${formatCurrency(props.budget_used)}/ ${formatCurrency(props.total_budget)}`
                            : formatCurrency(props.total_budget)
                    }
                />
                <div
                    className="!h-14 !w-px shrink-0 self-center !bg-black-300 @max-[240px]:hidden"
                    aria-hidden
                />
                <StatColumn
                    grow
                    icon={<RxPeople aria-hidden />}
                    label="Staff"
                    value={`${props.members.toLocaleString()} ${props.members === 1 ? 'member' : 'members'}`}
                />
            </div>

            {props.variant === 'active' ? (
                // A project with no budget set divides by zero; show 0% rather
                // than "NaN%" and a bar of unset width.
                (() => {
                    const percentUsed = props.total_budget > 0
                        ? Math.round((props.budget_used / props.total_budget) * 100)
                        : 0;
                    return (
                        <div className="mt-auto flex flex-row items-center !gap-3">
                            <div className="!h-6 w-full rounded-full !bg-black-300 !p-0.5">
                                <div
                                    // Capped at 100% so an overspent project fills the
                                    // track instead of overflowing the rounded corners.
                                    style={{ width: `${Math.min(percentUsed, 100)}%` }}
                                    className="!h-full rounded-full !bg-core-green"
                                />
                            </div>
                            <p className="shrink-0">{percentUsed}%</p>
                        </div>
                    );
                })()
            ) : (
                <div className="mt-auto flex flex-col !gap-2">
                    <hr className="!border-0 !border-t !border-solid !border-black-300" />
                    <div className="flex flex-row items-center !gap-3 @max-[240px]:flex-col @max-[240px]:items-start @max-[240px]:!gap-2">
                        <div className="flex min-w-0 flex-1 flex-col !gap-1">
                            <small className="!font-bold">Start Date</small>
                            <p className="truncate">{props.start_date}</p>
                        </div>
                        <FaArrowRight className="shrink-0 @max-[240px]:hidden" aria-hidden />
                        <div className="flex min-w-0 flex-1 flex-col !gap-1">
                            <small className="!font-bold">End Date</small>
                            <p className="truncate">{props.end_date}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
