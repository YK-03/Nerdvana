type ExploreSectionProps={
    title: string;
    description?: string;
    children: React.ReactNode;
    actions?: React.ReactNode;  
}

export default function ExploreSection(
    {
        title,
        description,
        children,
        actions,
    }:ExploreSectionProps
){
    return (
        <section className="space-y-4">
            <div>
            <h2 className= "text-2xl font-bold">{title}</h2>
            </div>
            <div className="flex justify-between items-center">
            {actions}
            </div>
            {description && <p className="text-muted-foreground">{description}</p>}
            <hr/>
            {children}
        </section>
    )
}