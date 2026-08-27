import React from "react";
import { Calendar, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface BlogPostHeaderProps {
  title: string;
  date: string;
  author: string;
  image?: string;
  tags?: string[];
}

export const BlogPostHeader: React.FC<BlogPostHeaderProps> = ({
  title,
  date,
  author,
  image,
  tags
}) => {
  return (
    <div className="mb-12 pt-10">
      <div className="max-w-4xl">
        <div className="flex flex-wrap gap-2 mb-6">
          {tags?.map(tag => (
            <Badge key={tag} variant="secondary" className="bg-violet-500/10 text-violet-500 border-none px-3 py-1">
              {tag}
            </Badge>
          ))}
        </div>

        <h1 className="text-4xl md:text-5xl font-bold mb-8 leading-tight tracking-tight">
          {title}
        </h1>

        <div className="flex items-center gap-6 text-sm text-muted-foreground mb-12 py-6 border-y border-border/50">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-violet-500" />
            <span className="font-medium text-foreground">{author}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-violet-500" />
            <span>{date}</span>
          </div>
        </div>

        {image && (
          <div className="rounded-[2rem] overflow-hidden border border-border/50 shadow-2xl mb-12 aspect-[21/9]">
            <img src={image} alt={title} className="w-full h-full object-cover" />
          </div>
        )}
      </div>
    </div>
  );
};
