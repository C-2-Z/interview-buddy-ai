/** 旧面试会话只读路由。 */
import {createFileRoute} from "@tanstack/react-router";
import {LegacySessionReadonly} from "@/features/interview-history/components/legacy-session-readonly";

export const Route=createFileRoute("/_authenticated/legacy/$id")({component:LegacyReadonlyRoute});
/** 仅把路径 UUID 传给只读业务组件。 */
function LegacyReadonlyRoute(){return <LegacySessionReadonly sessionId={Route.useParams().id}/>;}
