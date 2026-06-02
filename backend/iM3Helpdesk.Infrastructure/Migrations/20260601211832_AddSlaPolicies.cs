using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iM3Helpdesk.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSlaPolicies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BusinessHours",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Monday = table.Column<bool>(type: "bit", nullable: false),
                    Tuesday = table.Column<bool>(type: "bit", nullable: false),
                    Wednesday = table.Column<bool>(type: "bit", nullable: false),
                    Thursday = table.Column<bool>(type: "bit", nullable: false),
                    Friday = table.Column<bool>(type: "bit", nullable: false),
                    Saturday = table.Column<bool>(type: "bit", nullable: false),
                    Sunday = table.Column<bool>(type: "bit", nullable: false),
                    StartTime = table.Column<string>(type: "nvarchar(5)", maxLength: 5, nullable: false),
                    EndTime = table.Column<string>(type: "nvarchar(5)", maxLength: 5, nullable: false),
                    Timezone = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BusinessHours", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SlaPolicies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    IsDefault = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    Order = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SlaPolicies", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SlaEscalations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SlaPolicyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TargetType = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    EscalateAfterMinutes = table.Column<int>(type: "int", nullable: false),
                    Recipients = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SlaEscalations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SlaEscalations_SlaPolicies_SlaPolicyId",
                        column: x => x.SlaPolicyId,
                        principalTable: "SlaPolicies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SlaReminders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SlaPolicyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TargetType = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ApproachInMinutes = table.Column<int>(type: "int", nullable: false),
                    Recipients = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SlaReminders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SlaReminders_SlaPolicies_SlaPolicyId",
                        column: x => x.SlaPolicyId,
                        principalTable: "SlaPolicies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SlaTargets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SlaPolicyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Priority = table.Column<int>(type: "int", nullable: false),
                    FirstResponseMinutes = table.Column<int>(type: "int", nullable: false),
                    ResolutionMinutes = table.Column<int>(type: "int", nullable: false),
                    OperationalHours = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    EscalationEnabled = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SlaTargets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SlaTargets_SlaPolicies_SlaPolicyId",
                        column: x => x.SlaPolicyId,
                        principalTable: "SlaPolicies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BusinessHours_OrganizationId",
                table: "BusinessHours",
                column: "OrganizationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SlaEscalations_SlaPolicyId",
                table: "SlaEscalations",
                column: "SlaPolicyId");

            migrationBuilder.CreateIndex(
                name: "IX_SlaPolicies_OrganizationId",
                table: "SlaPolicies",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_SlaPolicies_OrganizationId_IsDefault",
                table: "SlaPolicies",
                columns: new[] { "OrganizationId", "IsDefault" });

            migrationBuilder.CreateIndex(
                name: "IX_SlaReminders_SlaPolicyId",
                table: "SlaReminders",
                column: "SlaPolicyId");

            migrationBuilder.CreateIndex(
                name: "IX_SlaTargets_SlaPolicyId_Priority",
                table: "SlaTargets",
                columns: new[] { "SlaPolicyId", "Priority" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BusinessHours");

            migrationBuilder.DropTable(
                name: "SlaEscalations");

            migrationBuilder.DropTable(
                name: "SlaReminders");

            migrationBuilder.DropTable(
                name: "SlaTargets");

            migrationBuilder.DropTable(
                name: "SlaPolicies");
        }
    }
}
