"use client";

import React, { useState, useEffect } from "react";
import { GitHubIcon } from "nextra/icons";
import cn from "clsx";

interface GitHubStarLinkProps {
  projectLink: string;
  className?: string;
}

export const GitHubStarLink: React.FC<GitHubStarLinkProps> = ({
  projectLink,
  className,
}) => {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    if (!projectLink) return;

    const getRepoInfo = (url: string) => {
      const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (match) {
        return { owner: match[1], repo: match[2] };
      }
      return null;
    };

    const fetchStars = async () => {
      const repoInfo = getRepoInfo(projectLink);
      if (!repoInfo) return;

      try {
        const response = await fetch(
          `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`
        );
        if (response.ok) {
          const data = await response.json();
          setStars(data.stargazers_count);
        }
      } catch (error) {
        console.error("Failed to fetch GitHub stars:", error);
      }
    };

    fetchStars();
  }, [projectLink]);

  return (
    <a
      href={projectLink}
      target='_blank'
      rel='noopener noreferrer'
      className={cn(
        "text-sm contrast-more:text-foreground whitespace-nowrap",
        "text-muted-foreground hover:text-foreground",
        "ring-inset transition-colors flex items-center gap-1.5",
        className
      )}
      aria-label='Project repository'
    >
      <GitHubIcon height='24' />
      {stars !== null && (
        <div className='flex items-center gap-1 text-xs font-medium'>
          <span>{stars.toLocaleString()}</span>
        </div>
      )}
    </a>
  );
};
