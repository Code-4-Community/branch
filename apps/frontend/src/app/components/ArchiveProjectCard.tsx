import React from 'react';
import { LuDollarSign } from "react-icons/lu";
import { RxPeople } from "react-icons/rx";
import { FaArrowRight } from "react-icons/fa6";

interface ArchiveCardProps {
    name: string;
    total_budget: number;
    members: number;
    start_date: string;
    end_date: string;
}

export default function ArchiveProjectCard({ name, total_budget, members, start_date, end_date }: ArchiveCardProps) {
    return (
        <div className="!border-[1px] border-solid border-black-300 w-full sm:w-[50%] md:w-[35%] lg:w-[25%] rounded-[4px] overflow-hidden">
            <div className="flex flex-col !gap-3 !p-4">
                <h4>{name}</h4>
                <div className="flex flex-row w-full !pb-3 !border-b-[2px] border-black-300 justify-center !gap-2 !px-2">
                    <div className="flex flex-col !gap-1 !pr-4 !border-r-[2px] border-black-300 flex-1">
                        <div className="flex flex-row items-center !gap-1">
                            <LuDollarSign />
                            <h5 className="!font-bold">Budget</h5>
                        </div>
                        <p className="truncate">${total_budget.toLocaleString()}</p>
                    </div>
                    <div className="flex flex-col !gap-1 !pl-4 flex-1">
                        <div className="flex flex-row items-center !gap-1">
                            <RxPeople />
                            <h5 className="!font-bold">Staff</h5>
                        </div>
                        <p className="truncate">{members.toLocaleString()} members</p>
                    </div>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] w-full items-center !gap-2 !px-2">
                    <div className="flex flex-col !gap-1">
                        <h5 className="!font-bold">Start Date</h5>
                        <p>{start_date}</p>
                    </div>
                    <FaArrowRight className="justify-self-center" />
                    <div className="flex flex-col !gap-1">
                        <h5 className="!font-bold">End Date</h5>
                        <p>{end_date}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}