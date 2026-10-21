import { Component, input } from '@angular/core';
import { LucideIconInput, LucideDynamicIcon, LucideLayoutDashboard, LucideSend, LucidePanelsTopLeft, LucideUsers, LucideChartNoAxesCombined, LucideGlobe, LucideMail, LucideArrowUpRight, LucidePlus, LucideCircleHelp, LucideChevronDown, LucideX, LucideType, LucideHeading1, LucideImage, LucideRectangleHorizontal, LucideMinus, LucideMoveVertical, LucideGripVertical, LucideSparkles, LucideFileText, LucideUpload, LucideMousePointerClick, LucideEye, LucideUndo2, LucideRedo2, LucideSettings2 } from '@lucide/angular';
@Component({selector:'ds-icon',standalone:true,imports:[LucideDynamicIcon],template:'<svg [lucideIcon]="icons[name()] || icons[\'mail\']" [size]="size()" [strokeWidth]="1.65" aria-hidden="true"></svg>'})
export class DsIcon {
 readonly name=input('mail'); readonly size=input(18);
 readonly icons: Record<string, LucideIconInput> = {dashboard:LucideLayoutDashboard,send:LucideSend,editor:LucidePanelsTopLeft,users:LucideUsers,chart:LucideChartNoAxesCombined,globe:LucideGlobe,mail:LucideMail,arrow:LucideArrowUpRight,plus:LucidePlus,help:LucideCircleHelp,chevron:LucideChevronDown,close:LucideX,text:LucideType,heading:LucideHeading1,image:LucideImage,button:LucideRectangleHorizontal,divider:LucideMinus,spacer:LucideMoveVertical,grip:LucideGripVertical,sparkles:LucideSparkles,file:LucideFileText,upload:LucideUpload,click:LucideMousePointerClick,eye:LucideEye,undo:LucideUndo2,redo:LucideRedo2,settings:LucideSettings2};
}

