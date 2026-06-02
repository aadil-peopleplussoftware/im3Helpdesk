using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iM3Helpdesk.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ExtendBusinessHours : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_BusinessHours_OrganizationId",
                table: "BusinessHours");

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "BusinessHours",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDefault",
                table: "BusinessHours",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Mode",
                table: "BusinessHours",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Name",
                table: "BusinessHours",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "BusinessHoursId",
                table: "AgentGroups",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "BusinessHoursHolidays",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BusinessHoursId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    IsRecurring = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BusinessHoursHolidays", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BusinessHoursHolidays_BusinessHours_BusinessHoursId",
                        column: x => x.BusinessHoursId,
                        principalTable: "BusinessHours",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BusinessHours_OrganizationId",
                table: "BusinessHours",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessHours_OrganizationId_IsDefault",
                table: "BusinessHours",
                columns: new[] { "OrganizationId", "IsDefault" });

            migrationBuilder.CreateIndex(
                name: "IX_AgentGroups_BusinessHoursId",
                table: "AgentGroups",
                column: "BusinessHoursId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessHoursHolidays_BusinessHoursId",
                table: "BusinessHoursHolidays",
                column: "BusinessHoursId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BusinessHoursHolidays");

            migrationBuilder.DropIndex(
                name: "IX_BusinessHours_OrganizationId",
                table: "BusinessHours");

            migrationBuilder.DropIndex(
                name: "IX_BusinessHours_OrganizationId_IsDefault",
                table: "BusinessHours");

            migrationBuilder.DropIndex(
                name: "IX_AgentGroups_BusinessHoursId",
                table: "AgentGroups");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "BusinessHours");

            migrationBuilder.DropColumn(
                name: "IsDefault",
                table: "BusinessHours");

            migrationBuilder.DropColumn(
                name: "Mode",
                table: "BusinessHours");

            migrationBuilder.DropColumn(
                name: "Name",
                table: "BusinessHours");

            migrationBuilder.DropColumn(
                name: "BusinessHoursId",
                table: "AgentGroups");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessHours_OrganizationId",
                table: "BusinessHours",
                column: "OrganizationId",
                unique: true);
        }
    }
}
