import React from 'react';
import { LuDollarSign } from "react-icons/lu";
import { RxPeople } from "react-icons/rx";

interface ProjectCardProps {
    name: string;
    total_budget: number;
    budget_used: number;
    members: number;
}

export default function ActiveProjectCard({ name, total_budget, budget_used, members }: ProjectCardProps) {
    const percentage = Math.round((budget_used / total_budget) * 100);

    return (
        <div className="!border-[1px] border-solid border-black-300 w-full sm:w-[50%] md:w-[35%] lg:w-[25%] lg:h-[22%] rounded-[4px] overflow-hidden">
            <div className="flex flex-col !gap-3 !p-4">
                <h4>{name}</h4>
                <div className="flex flex-row min-w-0">
                    <div className="flex flex-col !gap-1 !pr-4 !border-r-[2px] border-black-300 min-w-0">
                        <div className="flex flex-row items-center !gap-1">
                            <LuDollarSign />
                            <h5 className="!font-bold">Budget</h5>
                        </div>
                        <p className="truncate">${budget_used.toLocaleString()}/${total_budget.toLocaleString()}</p>
                    </div>
                    <div className="flex flex-col !gap-1 !pl-4 min-w-0">
                        <div className="flex flex-row items-center !gap-1">
                            <RxPeople />
                            <h5 className="!font-bold">Staff</h5>
                        </div>
                        <p className="truncate">{members.toLocaleString()} members</p>
                    </div>
                </div>
                <div className="flex flex-row items-center !gap-2">
                    <div className="w-full !h-[24px] rounded-full bg-black-100">
                        <div className={`w-[${percentage}%] !h-full rounded-full bg-core-green`} />
                    </div>
                    <p>30%</p>
                </div>
            </div>
        </div>
    );
}