CREATE TABLE "bot_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(255) NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bot_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chatwoot_id" integer NOT NULL,
	"chatwoot_account_id" integer NOT NULL,
	"inbox_id" integer,
	"contact_id" integer,
	"status" varchar(50),
	"assignee_id" integer,
	"team_id" integer,
	"labels" jsonb DEFAULT '[]'::jsonb,
	"custom_attributes" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_chatwoot_id_unique" UNIQUE("chatwoot_id")
);
--> statement-breakpoint
CREATE TABLE "execution_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"source" varchar(50) NOT NULL,
	"direction" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"input_data" jsonb NOT NULL,
	"output_data" jsonb,
	"error_message" text,
	"duration_ms" integer,
	"conversation_id" varchar(100),
	"contact_id" varchar(100),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_conversations_chatwoot_id" ON "conversations" USING btree ("chatwoot_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_status" ON "conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_exec_logs_event_type" ON "execution_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_exec_logs_status" ON "execution_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_exec_logs_created_at" ON "execution_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_exec_logs_conversation_id" ON "execution_logs" USING btree ("conversation_id");