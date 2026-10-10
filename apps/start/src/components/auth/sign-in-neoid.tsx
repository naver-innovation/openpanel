import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { useTRPC } from '@/integrations/trpc/react';

export function SignInNeoid({
  type,
  inviteId,
  isLastUsed,
}: {
  type: 'sign-in' | 'sign-up';
  inviteId?: string;
  isLastUsed?: boolean;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.neoidAuth.start.mutationOptions({
      onSuccess(result) {
        window.location.href = result.url;
      },
      onError(error) {
        toast.error(error.message);
      },
    })
  );

  return (
    <div className="relative">
      <Button
        className="w-full border border-def-300 bg-background text-foreground shadow-sm transition-all duration-200 hover:bg-def-100 hover:shadow-md"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate({ inviteId })}
        size="lg"
      >
        <span className="mr-2 flex size-4 items-center justify-center rounded-sm bg-[#03C75A] font-bold text-white text-xs">
          N
        </span>
        {type === 'sign-in' ? 'Sign in with NAVER' : 'Sign up with NAVER'}
      </Button>
      {isLastUsed && (
        <span className="absolute -top-2 right-3 rounded-full bg-highlight px-1.5 py-0.5 font-medium text-[10px] text-white leading-none">
          Used last time
        </span>
      )}
    </div>
  );
}
