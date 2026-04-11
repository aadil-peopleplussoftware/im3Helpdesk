using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iM3Helpdesk.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAgentGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AgentGroupId",
                table: "Tickets",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AgentGroups",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AgentGroups", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AgentGroupMembers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AgentGroupId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AddedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AgentGroupMembers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AgentGroupMembers_AgentGroups_AgentGroupId",
                        column: x => x.AgentGroupId,
                        principalTable: "AgentGroups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AgentGroupMembers_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_AgentGroupId",
                table: "Tickets",
                column: "AgentGroupId");

            migrationBuilder.CreateIndex(
                name: "IX_AgentGroupMembers_AgentGroupId",
                table: "AgentGroupMembers",
                column: "AgentGroupId");

            migrationBuilder.CreateIndex(
                name: "IX_AgentGroupMembers_UserId",
                table: "AgentGroupMembers",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Tickets_AgentGroups_AgentGroupId",
                table: "Tickets",
                column: "AgentGroupId",
                principalTable: "AgentGroups",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Tickets_AgentGroups_AgentGroupId",
                table: "Tickets");

            migrationBuilder.DropTable(
                name: "AgentGroupMembers");

            migrationBuilder.DropTable(
                name: "AgentGroups");

            migrationBuilder.DropIndex(
                name: "IX_Tickets_AgentGroupId",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "AgentGroupId",
                table: "Tickets");
        }
    }
}
