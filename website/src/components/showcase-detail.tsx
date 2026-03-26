"use client";

import Link from "next/link";

interface RelatedCase {
  title: string;
  link: string;
  thumbnail: string;
}

interface Step {
  title: string;
  description: string;
  command?: string;
}

interface ShowcaseDetailHeaderProps {
  title: string;
  description: string;
  role: string;
  model?: string;
  author?: string;
  features?: string[];
  difficulty?: string;
  duration?: string;
  videoUrl?: string;
  thumbnail?: string;
  steps?: Step[];
}

interface ShowcaseDetailFooterProps {
  relatedCases?: RelatedCase[];
  ctaText?: string;
}

export interface ShowcaseDetailProps extends ShowcaseDetailHeaderProps, ShowcaseDetailFooterProps {}

function ShowcaseDetailHeader({
  title,
  description,
  role,
  model,
  author = "Qwen Team",
  features = [],
  difficulty,
  duration,
  videoUrl,
  thumbnail,
  steps = [],
}: ShowcaseDetailHeaderProps) {
  const getDifficultyColor = (diff?: string) => {
    if (!diff) return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    switch (diff.toLowerCase()) {
      case 'beginner':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'intermediate':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'advanced':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4 text-foreground">{title}</h1>
        <p className="text-lg text-muted-foreground mb-6">{description}</p>

        {/* Meta Info */}
        <div className="flex flex-wrap gap-3 mb-6">
          <span className="px-3 py-1 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 text-sm font-medium">
            {role}
          </span>
          {model && (
            <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 text-sm font-medium">
              {model}
            </span>
          )}
          {difficulty && (
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getDifficultyColor(difficulty)}`}>
              {difficulty}
            </span>
          )}
          {duration && (
            <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-sm font-medium">
              {duration}
            </span>
          )}
        </div>

        {/* Features */}
        {features.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {features.map((feature, index) => (
              <span
                key={index}
                className="px-2.5 py-1 rounded-md bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 text-sm font-medium"
              >
                {feature}
              </span>
            ))}
          </div>
        )}

        {/* Author */}
        {author && (
          <p className="text-sm text-muted-foreground">By {author}</p>
        )}
      </div>

      {/* Video/Thumbnail */}
      {(videoUrl || thumbnail) && (
        <div className="mb-8 rounded-xl overflow-hidden shadow-lg">
          {videoUrl ? (
            <video
              src={videoUrl}
              poster={thumbnail}
              controls
              className="w-full max-h-[500px] object-cover"
            />
          ) : thumbnail ? (
            <img
              src={thumbnail}
              alt={title}
              className="w-full max-h-[500px] object-cover"
            />
          ) : null}
        </div>
      )}

      {/* Steps */}
      {steps.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-6 text-foreground">操作步骤</h2>
          <div className="space-y-6">
            {steps.map((step, index) => (
              <div
                key={index}
                className="border-l-4 border-violet-500 pl-5 py-3 bg-muted/30 rounded-r-lg"
              >
                <h3 className="text-lg font-semibold mb-2 text-foreground">
                  {index + 1}. {step.title}
                </h3>
                <p className="text-muted-foreground mb-3 leading-relaxed">
                  {step.description}
                </p>
                {step.command && (
                  <div className="bg-background border border-border p-3 rounded-md font-mono text-sm overflow-x-auto">
                    <code>{step.command}</code>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ShowcaseDetailFooter({
  relatedCases = [],
  ctaText,
}: ShowcaseDetailFooterProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 pb-8">
      {/* Related Cases */}
      {relatedCases && relatedCases.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-6 text-foreground">相关案例</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {relatedCases.map((caseItem, index) => (
              <Link
                key={index}
                href={caseItem.link}
                className="block border border-border rounded-lg overflow-hidden hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-lg transition-all"
              >
                {caseItem.thumbnail && (
                  <img
                    src={caseItem.thumbnail}
                    alt={caseItem.title}
                    className="w-full h-40 object-cover"
                  />
                )}
                <div className="p-4">
                  <h3 className="font-semibold text-foreground">{caseItem.title}</h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      {ctaText && (
        <div className="text-center py-8 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-xl">
          <p className="text-lg font-medium mb-4 text-foreground">{ctaText}</p>
          <Link
            href="/zh/docs/getting-started/installation"
            className="inline-block px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors shadow-sm hover:shadow-md"
          >
            开始使用 Qwen Code
          </Link>
        </div>
      )}
    </div>
  );
}

// Default export for backward compatibility
export function ShowcaseDetail(props: ShowcaseDetailProps) {
  return (
    <>
      <ShowcaseDetailHeader {...props} />
      <ShowcaseDetailFooter {...props} />
    </>
  );
}

export { ShowcaseDetailHeader, ShowcaseDetailFooter };
export default ShowcaseDetail;
