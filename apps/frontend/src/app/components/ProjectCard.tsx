import React from 'react';
import { LuDollarSign } from "react-icons/lu";
import { RxPeople } from "react-icons/rx";
import { FaArrowRight } from "react-icons/fa6";

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

type ProjectCardProps = ActiveProps | ArchiveProps;

export default function ProjectCard(props: ProjectCardProps) {
    return (
        <div className="!border-[1px] border-solid border-black-300 w-full sm:w-[50%] md:w-[35%] lg:w-[25%] rounded-[4px] overflow-hidden">
            <div className="flex flex-col !gap-3 !p-4">
                <h4>{props.name}</h4>
                <div className="flex flex-row min-w-0">
                    <div className="flex flex-col !gap-1 !pr-4 !border-r-[2px] border-black-300 min-w-0">
                        <div className="flex flex-row items-center !gap-1">
                            <LuDollarSign />
                            <h5 className="!font-bold">Budget</h5>
                        </div>
                        <p className="truncate">
                            {props.variant === 'active'
                                ? `$${props.budget_used.toLocaleString()}/$${props.total_budget.toLocaleString()}`
                                : `$${props.total_budget.toLocaleString()}`}
                        </p>
                    </div>
                    <div className="flex flex-col !gap-1 !pl-4 min-w-0">
                        <div className="flex flex-row items-center !gap-1">
                            <RxPeople />
                            <h5 className="!font-bold">Staff</h5>
                        </div>
                        <p className="truncate">{props.members.toLocaleString()} members</p>
                    </div>
                </div>
                {props.variant === 'active' ? (
                    <div className="flex flex-row items-center !gap-2">
                        <div className="w-full !h-[24px] rounded-full bg-black-100">
                            <div
                                style={{ width: `${Math.round((props.budget_used / props.total_budget) * 100)}%` }}
                                className="!h-full rounded-full bg-core-green"
                            />
                        </div>
                        <p>{Math.round((props.budget_used / props.total_budget) * 100)}%</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-[1fr_auto_1fr] w-full items-center !gap-2 !px-2">
                        <div className="flex flex-col !gap-1">
                            <h5 className="!font-bold">Start Date</h5>
                            <p>{props.start_date}</p>
                        </div>
                        <FaArrowRight className="justify-self-center" />
                        <div className="flex flex-col !gap-1">
                            <h5 className="!font-bold">End Date</h5>
                            <p>{props.end_date}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}